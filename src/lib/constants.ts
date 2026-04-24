// ─── BRANDING ────────────────────────────────────────────────────────────────
export const FIRM_NAME = "Financial Intelligence Network";
export const FIRM_SHORT = "Fintella";
export const FIRM_SLOGAN = "Fighting for what's owed, reclaiming what's fair.";
export const SUPPORT_EMAIL = "support@fintella.partners";

// ─── SENDGRID VERIFIED SENDERS ───────────────────────────────────────────────
// Addresses that have a matching Single Sender Verification in SendGrid.
// Surfaced as dropdown suggestions in the admin Email Template editor
// (From Email + Reply-To fields). Domain auth for fintella.partners means
// any address on that domain is technically sendable, but verified identities
// ensure the display name + reply address render correctly.
// Update this list when new sender identities are verified in SendGrid.
export const ALLOWED_SENDER_EMAILS: ReadonlyArray<string> = [
  "noreply@fintella.partners",
  "support@fintella.partners",
  "admin@fintella.partners",
  "legal@fintella.partners",
  "accounting@fintella.partners",
];

/** All @fintella.partners inbox addresses used for PartnerOS routing, in
 *  display order. Keep in sync with AdminInbox seed rows + ALLOWED_SENDER_EMAILS
 *  above. Used by /api/admin/inbox filtering + communications UI. */
export const FINTELLA_INBOX_ADDRESSES: ReadonlyArray<{
  role: "noreply" | "support" | "admin" | "legal" | "accounting";
  email: string;
  displayName: string;
}> = [
  { role: "noreply", email: "noreply@fintella.partners", displayName: "No-Reply" },
  { role: "support", email: "support@fintella.partners", displayName: "Support" },
  { role: "admin", email: "admin@fintella.partners", displayName: "Admin" },
  { role: "legal", email: "legal@fintella.partners", displayName: "Legal" },
  { role: "accounting", email: "accounting@fintella.partners", displayName: "Accounting" },
];

// ─── COMMISSION DEFAULTS ─────────────────────────────────────────────────────
// Firm fee rate is per-deal (negotiated between firm and client).
export const DEFAULT_FIRM_FEE_RATE = 0.20;

// Waterfall commission system
// - Admin assigns each L1 a rate from ALLOWED_L1_RATES (e.g., 10%, 15%, 20%, 25%)
// - Total payout per deal always equals the L1's assigned rate (not a fixed 25%)
// - Each tier keeps at least RATE_INCREMENT for themselves; the rest can go to downline
// - L1 direct deal → L1 earns their full commissionRate
// - L2 deal → L2 earns their rate, L1 earns (L1.commissionRate - L2.commissionRate)
// - L3 deal → L3 earns their rate, L2 earns (L2.commissionRate - L3.commissionRate),
//             L1 earns (L1.commissionRate - L2.commissionRate)
export const MAX_COMMISSION_RATE = 0.30;          // firm-wide ceiling on ANY partner rate. Bumped from 0.25 → 0.30 in Option B Phase 2 — custom L1 ceiling is now 30% (down from the old 50% cap on L1 create, up from the old 25% downline cap).
export const ALLOWED_L1_RATES = [0.10, 0.15, 0.20, 0.25]; // standard L1 bands — admin may also pick a custom rate up to MAX_COMMISSION_RATE (0.30)
export const RATE_INCREMENT = 0.05;               // all rates are multiples of 5%
export const MIN_KEEP_FOR_SELF = 0.05;            // min a partner retains when recruiting downline (standard case)

/**
 * Returns the rates this partner can offer to their recruit.
 * Range: [0.05 … downlineCeiling] in 5% steps, where:
 *   - standard case: downlineCeiling = inviterRate − 0.05 (leaves 5%+ for the inviter)
 *   - inviter above 25% (custom L1): downlineCeiling = 0.25 (firm cap)
 *
 * Examples:
 *   inviter 0.10 → [0.05]
 *   inviter 0.25 → [0.05, 0.10, 0.15, 0.20]                (unchanged)
 *   inviter 0.28 → [0.05, 0.10, 0.15, 0.20, 0.25]          (+25% option, firm cap)
 *   inviter 0.50 → [0.05, 0.10, 0.15, 0.20, 0.25]          (firm cap)
 */
export function getAllowedDownlineRates(inviterRate: number): number[] {
  const rates: number[] = [];
  const ceiling = inviterRate > MAX_COMMISSION_RATE
    ? MAX_COMMISSION_RATE
    : inviterRate - RATE_INCREMENT;
  for (let r = RATE_INCREMENT; r <= ceiling + 1e-9; r += RATE_INCREMENT) {
    rates.push(Math.round(r * 100) / 100);
  }
  return rates;
}

// Legacy — kept so older import sites don't break; use getAllowedDownlineRates() for new code
export const ALLOWED_L2_RATES = [0.05, 0.10, 0.15, 0.20]; // L1 @ 25% can offer these to L2
export const ALLOWED_L3_RATES = [0.05, 0.10, 0.15];        // L2 @ 20% can offer these to L3

export const DEFAULT_L1_RATE = 0.25;
export const DEFAULT_L2_RATE = 0.05;
export const DEFAULT_L3_RATE = 0;

// ─── DEAL STAGES ─────────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new_lead: { label: "New Lead", color: "#6b7280" },
  no_consultation: { label: "No Consultation Booked", color: "#ef4444" },
  consultation_booked: { label: "Consultation Booked", color: "#f59e0b" },
  client_no_show: { label: "Client No Show", color: "#ef4444" },
  client_qualified: { label: "Client Qualified", color: "#06b6d4" },
  client_engaged: { label: "Client Engaged", color: "#3b82f6" },
  in_process: { label: "In Process", color: "#8b5cf6" },
  closedwon: { label: "Closed Won", color: "#22c55e" },
  closedlost: { label: "Closed Lost", color: "#ef4444" },
};

// ─── COMMISSION STATUSES ─────────────────────────────────────────────────────
// Lifecycle (updated 2026-04-23):
//   projected       — deal is in client_engaged or in_process (seen + engaged)
//   pending_payment — deal is closed_won, firm has NOT yet paid Fintella
//   due             — closed_won + paymentReceivedAt set → ready to batch
//   paid            — batch processed
//   lost            — deal is closed_lost (kept for audit, never paid)
//
// Legacy "pending" is still tolerated by readers (maps to pending_payment
// for display) so pre-migration rows keep working. New writes use the
// names above via resolveCommissionStatus() in src/lib/commission.ts.
export const COMMISSION_STATUSES = [
  "projected",
  "pending_payment",
  "due",
  "paid",
  "lost",
] as const;
export type CommissionStatus = typeof COMMISSION_STATUSES[number];

export const COMMISSION_STATUS_COLORS: Record<string, string> = {
  projected:       "#a855f7", // purple — speculative earnings, not yet owed
  pending_payment: "#f59e0b", // amber  — earned but waiting on firm to wire
  pending:         "#f59e0b", // legacy alias → renders identical to pending_payment
  due:             "#3b82f6", // blue   — Fintella has the money, ready to batch
  approved:        "#3b82f6", // (legacy)
  paid:            "#22c55e", // green  — partner has been paid
  lost:            "#ef4444", // red    — deal died, no payout
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  projected:       "Projected",
  pending_payment: "Pending Payment",
  pending:         "Pending Payment", // legacy alias
  due:             "Due",
  approved:        "Due",             // legacy alias
  paid:            "Paid",
  lost:            "Lost",
};

// ─── SUPPORT TICKET CATEGORIES ───────────────────────────────────────────────
export const TICKET_CATEGORIES = [
  "Deal Tracking",
  "Tech Error / Bug",
  "Portal Question",
  "Commission Question",
  "Other",
] as const;

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

// ─── US STATES ──────────────────────────────────────────────────────────────
export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;

// ─── CALL RECORDING — ALL-PARTY CONSENT STATES ───────────────────────────────
// These US states require all parties to consent before a call may be recorded.
// When a partner's PartnerProfile.state is in this set and TWILIO_RECORDING_ENABLED
// is set, the voice-webhook prepends a consent disclosure before connecting the call.
export const ALL_PARTY_CONSENT_STATES = new Set([
  "CA", // California
  "CT", // Connecticut
  "DE", // Delaware
  "FL", // Florida
  "IL", // Illinois
  "MA", // Massachusetts
  "MD", // Maryland
  "MI", // Michigan
  "MT", // Montana
  "NH", // New Hampshire
  "NV", // Nevada
  "OR", // Oregon
  "PA", // Pennsylvania
  "WA", // Washington
]);

// ─── DOCUMENT TYPES ─────────────────────────────────────────────────────────
export const DOC_TYPE_LABELS: Record<string, string> = {
  agreement: "Agreement",
  w9: "W-9",
  w8: "W-8",
  tax_form: "Tax Form",
  bank_letter: "Bank Letter",
  voided_check: "Voided Check",
};
