// src/lib/partnerDmGate.ts
export type GateSubject = {
  partnerCode: string;
  tier: string;
  referredByPartnerCode: string | null;
};

/**
 * True iff a and b are in a direct parent-child relationship AND of the
 * permitted tiers for this feature: L1↔direct L2, or L2↔direct L3.
 * No skip-level. No siblings. No same-tier. No self.
 */
export function canPartnersDm(a: GateSubject, b: GateSubject): boolean {
  if (!a || !b) return false;
  if (a.partnerCode === b.partnerCode) return false;

  // L1 ↔ direct L2
  if (a.tier === "l1" && b.tier === "l2" && b.referredByPartnerCode === a.partnerCode) return true;
  if (b.tier === "l1" && a.tier === "l2" && a.referredByPartnerCode === b.partnerCode) return true;

  // L2 ↔ direct L3
  if (a.tier === "l2" && b.tier === "l3" && b.referredByPartnerCode === a.partnerCode) return true;
  if (b.tier === "l2" && a.tier === "l3" && a.referredByPartnerCode === b.partnerCode) return true;

  return false;
}

/**
 * Return [a, b] sorted alphabetically for canonical storage. Returns null
 * if the two codes are identical (self-DM would be invalid).
 */
export function canonicalizePair(a: string, b: string): [string, string] | null {
  if (a === b) return null;
  return a < b ? [a, b] : [b, a];
}
