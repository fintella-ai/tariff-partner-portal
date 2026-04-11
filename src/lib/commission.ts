import {
  DEFAULT_FIRM_FEE_RATE,
  DEFAULT_L1_RATE,
  DEFAULT_L2_RATE,
  DEFAULT_L3_RATE,
  MAX_COMMISSION_RATE,
} from "./constants";

// ─── Legacy types (backward compat) ──────────────────────────────────────────

export interface CommissionRates {
  firmFeeRate: number;
  l1Rate: number;
  l2Rate: number;
  l3Rate: number;
}

export function getDefaultRates(): CommissionRates {
  return {
    firmFeeRate: DEFAULT_FIRM_FEE_RATE,
    l1Rate: DEFAULT_L1_RATE,
    l2Rate: DEFAULT_L2_RATE,
    l3Rate: DEFAULT_L3_RATE,
  };
}

export function mergeWithOverrides(
  defaults: CommissionRates,
  overrides?: Partial<CommissionRates> | null
): CommissionRates {
  if (!overrides) return defaults;
  return {
    firmFeeRate: overrides.firmFeeRate ?? defaults.firmFeeRate,
    l1Rate: overrides.l1Rate ?? defaults.l1Rate,
    l2Rate: overrides.l2Rate ?? defaults.l2Rate,
    l3Rate: overrides.l3Rate ?? defaults.l3Rate,
  };
}

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

// Legacy functions (still used by some pages)
export function calcL1Commission(refund: number, rates?: CommissionRates): number {
  const r = rates || getDefaultRates();
  return calcFirmFee(refund, r.firmFeeRate) * r.l1Rate;
}

export function calcL2Commission(refund: number, rates?: CommissionRates): number {
  const r = rates || getDefaultRates();
  return calcFirmFee(refund, r.firmFeeRate) * r.l2Rate;
}

export function calcL3Commission(refund: number, rates?: CommissionRates): number {
  const r = rates || getDefaultRates();
  if (r.l3Rate === 0) return 0;
  return calcFirmFee(refund, r.firmFeeRate) * r.l3Rate;
}

export function hasL3Enabled(rates: CommissionRates): boolean {
  return rates.l3Rate > 0;
}
