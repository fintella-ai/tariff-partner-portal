import { DEFAULT_FIRM_FEE_RATE, MAX_COMMISSION_RATE } from "./constants";

export function calcFirmFee(refund: number, rate = DEFAULT_FIRM_FEE_RATE): number {
  return refund * rate;
}

/**
 * Map a deal's stage + payment state to the canonical commission status.
 *
 *   Pre-client-engaged stages    → null   (no ledger row yet)
 *   client_engaged / in_process  → "projected"
 *   closed_won + no payment      → "pending_payment"
 *   closed_won + paymentReceived → "due"
 *   closed_lost                  → "lost"
 *
 * Callers use `null` to mean "don't create / delete any row for this deal
 * in this lifecycle phase". Callers writing a row should upsert with the
 * returned value; callers updating an existing row should flip to it.
 *
 * Status names align with COMMISSION_STATUSES in src/lib/constants.ts.
 * The legacy "pending" value is never returned by this function — new
 * writes use "pending_payment" — but the payouts + UI layers still
 * display "pending" rows correctly as a transitional back-compat until
 * a data backfill renames them in the DB.
 */
export function resolveCommissionStatus(
  stage: string | null | undefined,
  paymentReceivedAt: Date | null | undefined,
): "projected" | "pending_payment" | "due" | "lost" | null {
  if (!stage) return null;
  if (stage === "closedlost") return "lost";
  if (stage === "closedwon") return paymentReceivedAt ? "due" : "pending_payment";
  if (stage === "client_engaged" || stage === "in_process") return "projected";
  return null; // pre-engagement stages — no commission row
}

// ─── Feature flag: sliding-window vs legacy waterfall ─────────────────────
// Flip via env var WATERFALL_SLIDING_WINDOW=true to switch every
// commission-computation call site to the Option B sliding-window model.
// Flag default off keeps live traffic on the legacy 3-tier waterfall
// until John flips it after parallel-run confirms equivalence.
function useSlidingWindow(): boolean {
  return process.env.WATERFALL_SLIDING_WINDOW === "true";
}

// ─── Waterfall Commission System ─────────────────────────────────────────────
// Total payout always equals the L1's assigned commissionRate (not a fixed 25%).
//
// L1 direct deal:  L1 = L1.commissionRate (10–25%)
// L2 deal:         L2 = L2.commissionRate, L1 override = L1.commissionRate - L2.commissionRate
// L3 deal:         L3 = L3.commissionRate, L2 override = L2.commissionRate - L3.commissionRate,
//                  L1 override = L1.commissionRate - L2.commissionRate

export interface PartnerChainNode {
  partnerCode: string;
  tier: string;          // "l1", "l2", "l3"
  commissionRate: number; // the rate assigned to this partner (e.g. 0.20)
}

export interface WaterfallResult {
  l1Amount: number;
  l1Rate: number;    // the override rate L1 earns
  l2Amount: number;
  l2Rate: number;    // the override rate L2 earns (or their direct rate if no L3)
  l3Amount: number;
  l3Rate: number;
  totalRate: number;
}

/**
 * Calculate waterfall commissions for a deal.
 *
 * @param firmFeeAmount - The firm fee amount (not the refund amount)
 * @param chain - Partner chain ordered [submitting partner, ...upline]
 *                For L1 deal: [L1]
 *                For L2 deal: [L2, L1]
 *                For L3 deal: [L3, L2, L1]
 */
export function calcWaterfallCommissions(
  firmFeeAmount: number,
  chain: PartnerChainNode[],
  maxRate = MAX_COMMISSION_RATE
): WaterfallResult {
  const result: WaterfallResult = {
    l1Amount: 0, l1Rate: 0,
    l2Amount: 0, l2Rate: 0,
    l3Amount: 0, l3Rate: 0,
    totalRate: 0,
  };

  if (chain.length === 0) return result;

  const submitter = chain[0];
  const l1Node = chain.find((n) => n.tier === "l1");
  const l1Rate = l1Node?.commissionRate ?? submitter.commissionRate;

  if (submitter.tier === "l1") {
    // L1 direct deal — L1 earns their assigned rate (10–25%)
    result.l1Rate = l1Rate;
    result.l1Amount = firmFeeAmount * l1Rate;
    result.totalRate = l1Rate;
  } else if (submitter.tier === "l2") {
    // L2 deal — L2 earns their rate, L1 earns the override slice
    const l2Rate = submitter.commissionRate;
    const l1Override = l1Rate - l2Rate;

    result.l2Rate = l2Rate;
    result.l2Amount = firmFeeAmount * l2Rate;
    result.l1Rate = l1Override;
    result.l1Amount = firmFeeAmount * l1Override;
    result.totalRate = l1Rate;
  } else if (submitter.tier === "l3") {
    // L3 deal — L3 earns their rate, L2 earns override, L1 earns override
    const l3Rate = submitter.commissionRate;
    const l2Node = chain.find((n) => n.tier === "l2");
    const l2Rate = l2Node?.commissionRate || 0;
    const l2Override = l2Rate - l3Rate;
    const l1Override = l1Rate - l2Rate;

    result.l3Rate = l3Rate;
    result.l3Amount = firmFeeAmount * l3Rate;
    result.l2Rate = l2Override;
    result.l2Amount = firmFeeAmount * l2Override;
    result.l1Rate = l1Override;
    result.l1Amount = firmFeeAmount * l1Override;
    result.totalRate = l1Rate;
  }

  return result;
}

/**
 * Calculate the override rate an L1 earns on an L2's deals.
 * @param l1Rate - the L1's own assigned commission rate
 * @param l2Rate - the L2's assigned commission rate
 */
export function calcL1Override(l2Rate: number, l1Rate = MAX_COMMISSION_RATE): number {
  return l1Rate - l2Rate;
}

// ─── Sliding-window waterfall (Option B, Phase 0) ─────────────────────────
// New commission model: every closed deal pays the submitter + up to 2
// ancestors in the chain. Anyone farther upline earns $0 on that deal.
//
// Design notes:
// - This function replaces the tier-label-aware waterfall with a
//   depth-indexed one. It walks exactly `min(3, chain.length)` rows.
// - The chain is expected to be ordered [submitter, parent, grandparent, …].
// - On the current 3-tier data this produces amounts identical to
//   calcWaterfallCommissions — the unit tests prove the equivalence.
// - Only wired into live code paths once WATERFALL_SLIDING_WINDOW is
//   flipped (Phase 1). For Phase 0 it's dead code that's unit-tested
//   for correctness.

export interface SlidingWaterfallInputNode {
  partnerCode: string;
  commissionRate: number; // the absolute rate this partner earns on their own deals (0 < r <= 0.30)
}

export interface SlidingWaterfallEntry {
  partnerCode: string;
  depthFromSubmitter: number; // 0 = submitter, 1 = parent, 2 = grandparent
  rate: number;               // the rate THIS entity actually earns on this deal (own rate for submitter; override for uplines)
  amount: number;             // firmFeeAmount * rate
}

export interface SlidingWaterfallResult {
  entries: SlidingWaterfallEntry[]; // 1–3 rows (submitter + 0-2 ancestors)
  totalRate: number;                // sum of all rates paid
  totalAmount: number;              // sum of all amounts paid
}

/**
 * Calculate commissions under the sliding-window model.
 *
 * @param firmFeeAmount  firm fee for the deal (NOT the refund amount)
 * @param chain          ordered [submitter, parent, grandparent, …] — any
 *                       length; entries beyond index 2 are ignored
 *
 * Math:
 *   entries[0] (submitter)    → earns submitter.rate
 *   entries[1] (parent)       → earns max(0, parent.rate - submitter.rate)
 *   entries[2] (grandparent)  → earns max(0, grandparent.rate - parent.rate)
 *   entries[3+]               → not emitted
 *
 * Negative overrides (parent rate < submitter rate) clamp to 0 as a
 * defensive guard against data corruption or validation bugs elsewhere —
 * they should never happen once the invite-time rate check lands.
 */
export function calcSlidingWindowWaterfall(
  firmFeeAmount: number,
  chain: SlidingWaterfallInputNode[]
): SlidingWaterfallResult {
  const result: SlidingWaterfallResult = { entries: [], totalRate: 0, totalAmount: 0 };
  if (chain.length === 0 || !firmFeeAmount || firmFeeAmount <= 0) return result;

  const submitter = chain[0];
  const parent = chain[1]; // may be undefined
  const grandparent = chain[2]; // may be undefined

  // Submitter always earns their own rate.
  const submitterRate = Math.max(0, submitter.commissionRate);
  if (submitterRate > 0) {
    result.entries.push({
      partnerCode: submitter.partnerCode,
      depthFromSubmitter: 0,
      rate: submitterRate,
      amount: firmFeeAmount * submitterRate,
    });
  }

  // Parent earns the differential to the submitter.
  if (parent) {
    const parentOverride = Math.max(0, parent.commissionRate - submitterRate);
    if (parentOverride > 0) {
      result.entries.push({
        partnerCode: parent.partnerCode,
        depthFromSubmitter: 1,
        rate: parentOverride,
        amount: firmFeeAmount * parentOverride,
      });
    }
  }

  // Grandparent earns the differential to the parent (NOT the submitter).
  if (grandparent && parent) {
    const gpOverride = Math.max(0, grandparent.commissionRate - parent.commissionRate);
    if (gpOverride > 0) {
      result.entries.push({
        partnerCode: grandparent.partnerCode,
        depthFromSubmitter: 2,
        rate: gpOverride,
        amount: firmFeeAmount * gpOverride,
      });
    }
  }

  for (const e of result.entries) {
    result.totalRate += e.rate;
    result.totalAmount += e.amount;
  }
  return result;
}

/**
 * Calculate the override rate an L2 earns on an L3's deals.
 */
export function calcL2Override(l2Rate: number, l3Rate: number): number {
  return l2Rate - l3Rate;
}

// ─── Deal-level Commission Computation (shared helper) ──────────────────────
// Used by both /api/webhook/referral PATCH (auto-create pending ledger entries
// when a deal first hits closed_won) and /api/admin/deals/[id]/payment-received
// (either flip existing pending entries to due, or fall back to creating
// fresh entries with due for deals that closed before the pending-on-close
// path shipped).

import type { PrismaClient } from "@prisma/client";

export interface ComputedLedgerEntry {
  partnerCode: string;
  tier: string;
  amount: number;
}

export interface DealCommissionComputation {
  entries: ComputedLedgerEntry[];
  chain: PartnerChainNode[];
  totalAmount: number;
  waterfall: WaterfallResult;
}

/**
 * Walk up from the submitting partner to their L1 and return the L1's
 * current `commissionRate`. Used to snapshot the L1 rate onto a Deal
 * at creation time so later changes to Partner.commissionRate don't
 * retro-affect deals already in flight.
 *
 * Returns null if the submitter doesn't exist, or if the chain is broken
 * (e.g. L2 with a missing referrer row). The caller decides whether to
 * fall back to the submitter's own rate.
 */
export async function getL1CommissionRateSnapshot(
  db: Pick<PrismaClient, "partner">,
  submitterPartnerCode: string
): Promise<number | null> {
  const submitter = await db.partner.findUnique({
    where: { partnerCode: submitterPartnerCode },
    select: { tier: true, commissionRate: true, referredByPartnerCode: true },
  });
  if (!submitter) return null;

  if (submitter.tier === "l1") return submitter.commissionRate;

  if (submitter.tier === "l2" && submitter.referredByPartnerCode) {
    const l1 = await db.partner.findUnique({
      where: { partnerCode: submitter.referredByPartnerCode },
      select: { tier: true, commissionRate: true },
    });
    return l1?.commissionRate ?? null;
  }

  if (submitter.tier === "l3" && submitter.referredByPartnerCode) {
    const l2 = await db.partner.findUnique({
      where: { partnerCode: submitter.referredByPartnerCode },
      select: { commissionRate: true, referredByPartnerCode: true },
    });
    if (l2?.referredByPartnerCode) {
      const l1 = await db.partner.findUnique({
        where: { partnerCode: l2.referredByPartnerCode },
        select: { commissionRate: true },
      });
      return l1?.commissionRate ?? null;
    }
  }

  return null;
}

/**
 * Walk the partner chain upward from the submitting partner on a deal,
 * call calcWaterfallCommissions against the deal's firm fee, and return
 * the ledger entries that should exist. The caller decides what status to
 * write them with.
 *
 * Accepts anything with a `.partner.findUnique` method — works with both
 * the main prisma client and a transaction client, so the function can be
 * invoked inside or outside an existing `prisma.$transaction`.
 */
export async function computeDealCommissions(
  db: Pick<PrismaClient, "partner">,
  deal: { partnerCode: string; firmFeeAmount: number }
): Promise<DealCommissionComputation> {
  if (!deal.firmFeeAmount || deal.firmFeeAmount <= 0) {
    return { entries: [], chain: [], totalAmount: 0, waterfall: { l1Amount: 0, l1Rate: 0, l2Amount: 0, l2Rate: 0, l3Amount: 0, l3Rate: 0, totalRate: 0 } };
  }

  const submitter = await db.partner.findUnique({
    where: { partnerCode: deal.partnerCode },
  });
  if (!submitter) return { entries: [], chain: [], totalAmount: 0, waterfall: { l1Amount: 0, l1Rate: 0, l2Amount: 0, l2Rate: 0, l3Amount: 0, l3Rate: 0, totalRate: 0 } };

  const chain: PartnerChainNode[] = [
    {
      partnerCode: submitter.partnerCode,
      tier: submitter.tier,
      commissionRate: submitter.commissionRate,
    },
  ];

  if (submitter.tier === "l3" && submitter.referredByPartnerCode) {
    const l2 = await db.partner.findUnique({
      where: { partnerCode: submitter.referredByPartnerCode },
    });
    if (l2) {
      chain.push({
        partnerCode: l2.partnerCode,
        tier: l2.tier,
        commissionRate: l2.commissionRate,
      });
      if (l2.referredByPartnerCode) {
        const l1 = await db.partner.findUnique({
          where: { partnerCode: l2.referredByPartnerCode },
        });
        if (l1) {
          chain.push({
            partnerCode: l1.partnerCode,
            tier: l1.tier,
            commissionRate: l1.commissionRate,
          });
        }
      }
    }
  } else if (submitter.tier === "l2" && submitter.referredByPartnerCode) {
    const l1 = await db.partner.findUnique({
      where: { partnerCode: submitter.referredByPartnerCode },
    });
    if (l1) {
      chain.push({
        partnerCode: l1.partnerCode,
        tier: l1.tier,
        commissionRate: l1.commissionRate,
      });
    }
  }

  // Spec §6: resolve the top-of-chain L1's payoutDownlineEnabled. For
  // L1-direct deals, that's the submitter. For L2/L3 deals, it's the L1
  // we walked up to. If the chain is incomplete or the L1 is missing,
  // default to false (Disabled — safer). Used by buildLedgerEntries to
  // decide whether to emit waterfall rows or collapse to a single L1 row.
  let payoutDownlineEnabled = false;
  if (submitter.tier === "l1") {
    payoutDownlineEnabled = (submitter as any).payoutDownlineEnabled ?? false;
  } else {
    const l1Node = chain.find((n) => n.tier === "l1");
    if (l1Node) {
      const l1Partner = await db.partner.findUnique({
        where: { partnerCode: l1Node.partnerCode },
        select: { payoutDownlineEnabled: true },
      });
      payoutDownlineEnabled = l1Partner?.payoutDownlineEnabled ?? false;
    }
  }

  const waterfall = calcWaterfallCommissions(deal.firmFeeAmount, chain);

  // Phase 1 flag gate: when the sliding-window model is enabled, rebuild
  // the ledger entries from calcSlidingWindowWaterfall instead of the
  // legacy tier-labeled buildLedgerEntries. The WaterfallResult we compute
  // above is still returned in the response for telemetry / logging, but
  // the on-disk ledger rows come from the new math when the flag is on.
  //
  // Equivalence: for existing 3-tier chains (l1/l2/l3), the two functions
  // produce identical amounts (proven in commission-sliding-window.test.ts).
  // The flag lets us parallel-run + diff-check for a week before flipping
  // portal-wide.
  if (useSlidingWindow()) {
    const slide = calcSlidingWindowWaterfall(
      deal.firmFeeAmount,
      chain.map((n) => ({ partnerCode: n.partnerCode, commissionRate: n.commissionRate })),
    );
    const slidingEntries = buildLedgerEntriesFromSliding(slide, chain, { payoutDownlineEnabled });
    const totalAmount = slidingEntries.reduce((s, e) => s + e.amount, 0);
    return { entries: slidingEntries, chain, totalAmount, waterfall };
  }

  const entries = buildLedgerEntries(waterfall, chain, { payoutDownlineEnabled });

  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
  return { entries, chain, totalAmount, waterfall };
}

/**
 * Build ledger entries from a SlidingWaterfallResult. Preserves the legacy
 * `payoutDownlineEnabled` collapse behavior (when false + the deal isn't
 * a self-deal, sum all payouts into a single row on the top ancestor)
 * so report shapes don't change when the flag flips.
 *
 * `tier` field on each entry carries the partner's absolute tier from the
 * original chain (l1/l2/l3/…), not the relative depth-from-submitter —
 * admin-side reports want the absolute label. Phase 4 partner UI derives
 * "My L2 / My L3" from depth-from-viewer at render time, not from this field.
 */
function buildLedgerEntriesFromSliding(
  slide: SlidingWaterfallResult,
  chain: PartnerChainNode[],
  options: BuildLedgerOptions,
): ComputedLedgerEntry[] {
  if (slide.entries.length === 0) return [];

  // Map each sliding-window entry back to its PartnerChainNode to get the
  // absolute tier for the ledger row.
  const byCode: Record<string, PartnerChainNode> = {};
  for (const n of chain) byCode[n.partnerCode] = n;

  const submitter = chain[0];
  const isDownlineDeal = submitter && submitter.tier !== "l1";

  // Disabled-payout collapse: same semantics as legacy — funnel the whole
  // deal's payouts onto the top-of-chain L1 as one row. "Top of chain" here
  // means the highest paid entity in the sliding window, which is the last
  // entry by depthFromSubmitter. For a 3-tier chain that's always the L1.
  if (!options.payoutDownlineEnabled && isDownlineDeal) {
    const l1Node = chain.find((n) => n.tier === "l1");
    const target = l1Node || slide.entries[slide.entries.length - 1];
    const sum = roundCents(slide.totalAmount);
    const targetCode = "partnerCode" in target ? target.partnerCode : (target as any).partnerCode;
    const targetTier = "tier" in target ? target.tier : (byCode[targetCode]?.tier ?? "l1");
    return [{ partnerCode: targetCode, tier: targetTier, amount: sum }];
  }

  return slide.entries.map((e) => {
    const node = byCode[e.partnerCode];
    return {
      partnerCode: e.partnerCode,
      tier: node?.tier ?? "l1",
      amount: roundCents(e.amount),
    };
  });
}

// ─── Ledger Entry Builder ────────────────────────────────────────────────
// Pure function that decides which ledger rows to write for a deal, based
// on the waterfall result + chain + the top-of-chain L1's payout-downline
// setting. Keeps the Enabled/Disabled branch out of computeDealCommissions
// so we can unit-test it in isolation. Spec §6.

export interface BuildLedgerOptions {
  payoutDownlineEnabled: boolean;
}

/** Round to the nearest cent to eliminate IEEE-754 float artifacts from
 *  rate subtraction (e.g. 0.25 − 0.20 = 0.04999…). All ledger dollar
 *  amounts are stored as integers (cents × 100) so sub-cent precision
 *  is meaningless and causes strict-equality test failures. Exported so
 *  callers that write Deal.l{1,2,3}CommissionAmount snapshots can apply
 *  the same rounding.
 */
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function buildLedgerEntries(
  waterfall: WaterfallResult,
  chain: PartnerChainNode[],
  options: BuildLedgerOptions
): ComputedLedgerEntry[] {
  const l1Node = chain.find((n) => n.tier === "l1");
  const l2Node = chain.find((n) => n.tier === "l2");
  const l3Node = chain.find((n) => n.tier === "l3");
  const submitter = chain[0];

  // Zero firm fee → no entries regardless of mode.
  if ((waterfall.l1Amount + waterfall.l2Amount + waterfall.l3Amount) === 0) {
    return [];
  }

  // Disabled mode: when an L2 or L3 deal runs under a Disabled L1, collapse
  // to a single L1 row at the FULL L1 rate. The waterfall amounts always
  // sum to L1's full assigned rate × firm fee (see calcWaterfallCommissions
  // — totalRate is always set to L1's own rate), so summing them gives
  // exactly what Fintella owes the L1. L1-direct deals already emit a
  // single L1 row at full rate in both modes, so we pass them through.
  const isDownlineDeal = submitter && submitter.tier !== "l1";
  if (!options.payoutDownlineEnabled && isDownlineDeal && l1Node) {
    const sum = roundCents(waterfall.l1Amount + waterfall.l2Amount + waterfall.l3Amount);
    return [{ partnerCode: l1Node.partnerCode, tier: "l1", amount: sum }];
  }

  // Enabled mode OR L1-direct deal: emit per-tier entries as before.
  const entries: ComputedLedgerEntry[] = [];
  if (l1Node && waterfall.l1Amount > 0) {
    entries.push({ partnerCode: l1Node.partnerCode, tier: "l1", amount: roundCents(waterfall.l1Amount) });
  }
  if (l2Node && waterfall.l2Amount > 0) {
    entries.push({ partnerCode: l2Node.partnerCode, tier: "l2", amount: roundCents(waterfall.l2Amount) });
  }
  if (l3Node && waterfall.l3Amount > 0) {
    entries.push({ partnerCode: l3Node.partnerCode, tier: "l3", amount: roundCents(waterfall.l3Amount) });
  }
  return entries;
}
