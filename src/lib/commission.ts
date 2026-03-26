import {
  DEFAULT_FIRM_FEE_RATE,
  DEFAULT_L1_RATE,
  DEFAULT_L2_RATE,
  DEFAULT_L3_RATE,
} from "./constants";

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
