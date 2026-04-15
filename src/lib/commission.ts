import { DEFAULT_FIRM_FEE_RATE, MAX_COMMISSION_RATE } from "./constants";

export function calcFirmFee(refund: number, rate = DEFAULT_FIRM_FEE_RATE): number {
  return refund * rate;
}

// ─── Waterfall Commission System ─────────────────────────────────────────────
// Total partner payout is capped at MAX_COMMISSION_RATE (25%) of firm fee.
//
// L1 direct deal:  L1 = 25%
// L2 deal:         L2 = assigned rate, L1 override = 25% - L2 rate
// L3 deal:         L3 = assigned rate, L2 override = L2 rate - L3 rate, L1 override = 25% - L2 rate

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

  if (submitter.tier === "l1") {
    // L1 direct deal — L1 gets full max rate
    result.l1Rate = maxRate;
    result.l1Amount = firmFeeAmount * maxRate;
    result.totalRate = maxRate;
  } else if (submitter.tier === "l2") {
    // L2 deal — L2 gets their rate, L1 gets override
    const l2Rate = submitter.commissionRate;
    const l1Override = maxRate - l2Rate;

    result.l2Rate = l2Rate;
    result.l2Amount = firmFeeAmount * l2Rate;
    result.l1Rate = l1Override;
    result.l1Amount = firmFeeAmount * l1Override;
    result.totalRate = maxRate;
  } else if (submitter.tier === "l3") {
    // L3 deal — waterfall: L3 rate, L2 override, L1 override
    const l3Rate = submitter.commissionRate;
    const l2Node = chain.find((n) => n.tier === "l2");
    const l2Rate = l2Node?.commissionRate || 0;
    const l2Override = l2Rate - l3Rate;
    const l1Override = maxRate - l2Rate;

    result.l3Rate = l3Rate;
    result.l3Amount = firmFeeAmount * l3Rate;
    result.l2Rate = l2Override;
    result.l2Amount = firmFeeAmount * l2Override;
    result.l1Rate = l1Override;
    result.l1Amount = firmFeeAmount * l1Override;
    result.totalRate = maxRate;
  }

  return result;
}

/**
 * Calculate the override rate an L1 earns on an L2's deals.
 */
export function calcL1Override(l2Rate: number, maxRate = MAX_COMMISSION_RATE): number {
  return maxRate - l2Rate;
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
    return { entries: [], chain: [], totalAmount: 0 };
  }

  const submitter = await db.partner.findUnique({
    where: { partnerCode: deal.partnerCode },
  });
  if (!submitter) return { entries: [], chain: [], totalAmount: 0 };

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

  const waterfall = calcWaterfallCommissions(deal.firmFeeAmount, chain);

  const entries: ComputedLedgerEntry[] = [];
  const l1Node = chain.find((n) => n.tier === "l1");
  const l2Node = chain.find((n) => n.tier === "l2");
  const l3Node = chain.find((n) => n.tier === "l3");
  if (l1Node && waterfall.l1Amount > 0) {
    entries.push({ partnerCode: l1Node.partnerCode, tier: "l1", amount: waterfall.l1Amount });
  }
  if (l2Node && waterfall.l2Amount > 0) {
    entries.push({ partnerCode: l2Node.partnerCode, tier: "l2", amount: waterfall.l2Amount });
  }
  if (l3Node && waterfall.l3Amount > 0) {
    entries.push({ partnerCode: l3Node.partnerCode, tier: "l3", amount: waterfall.l3Amount });
  }

  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
  return { entries, chain, totalAmount };
}
