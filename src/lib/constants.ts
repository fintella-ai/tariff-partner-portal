// ─── BRANDING ────────────────────────────────────────────────────────────────
export const FIRM_NAME = "Financial Intelligence Network";
export const FIRM_SHORT = "Fintella";
export const FIRM_SLOGAN = "Fighting for what's owed, reclaiming what's fair.";
export const FIRM_PHONE = "(410) 497-5947";

// ─── COMMISSION DEFAULTS ─────────────────────────────────────────────────────
// Firm fee rate is per-deal (negotiated between firm and client).
export const DEFAULT_FIRM_FEE_RATE = 0.20;

// Waterfall commission system: total partner payout capped at MAX_COMMISSION_RATE of firm fee
export const MAX_COMMISSION_RATE = 0.25;        // L1 direct deal rate (25% of firm fee)
export const ALLOWED_L2_RATES = [0.10, 0.15, 0.20]; // L1 chooses for their L2 recruits
export const ALLOWED_L3_RATES = [0.10, 0.15];       // L2 chooses for their L3 recruits

// Legacy defaults (kept for backward compatibility)
export const DEFAULT_L1_RATE = 0.25; // 25% of firm fee
export const DEFAULT_L2_RATE = 0.05; // legacy
export const DEFAULT_L3_RATE = 0;    // off by default

// ─── DEAL STAGES ─────────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new_lead: { label: "New Lead", color: "#6b7280" },
  no_consultation: { label: "No Consultation Booked", color: "#ef4444" },
  consultation_booked: { label: "Consultation Booked", color: "#f59e0b" },
  client_no_show: { label: "Client No Show", color: "#ef4444" },
  client_engaged: { label: "Client Engaged", color: "#3b82f6" },
  in_process: { label: "In Process", color: "#8b5cf6" },
  closedwon: { label: "Closed Won", color: "#22c55e" },
  closedlost: { label: "Closed Lost", color: "#ef4444" },
};

// ─── COMMISSION STATUSES ─────────────────────────────────────────────────────
export const COMMISSION_STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  due: "#3b82f6",
  approved: "#3b82f6",
  paid: "#22c55e",
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

// ─── DOCUMENT TYPES ─────────────────────────────────────────────────────────
export const DOC_TYPE_LABELS: Record<string, string> = {
  agreement: "Agreement",
  w9: "W-9",
  w8: "W-8",
  tax_form: "Tax Form",
  bank_letter: "Bank Letter",
  voided_check: "Voided Check",
};
