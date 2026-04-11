// ─── BRANDING ────────────────────────────────────────────────────────────────
export const FIRM_NAME = "Tariff Refund & Litigation Network";
export const FIRM_SHORT = "TRLN";
export const FIRM_SLOGAN = "Fighting for what's owed, reclaiming what's fair.";
export const FIRM_PHONE = "(410) 497-5947";

// ─── COMMISSION DEFAULTS ─────────────────────────────────────────────────────
// Firm fee rate is per-deal (negotiated between firm and client).
// This example rate is only used for display/demo calculations.
export const DEFAULT_FIRM_FEE_RATE = 0.20;
export const DEFAULT_L1_RATE = 0.20; // 20% of firm fee
export const DEFAULT_L2_RATE = 0.05; // 5% of firm fee
export const DEFAULT_L3_RATE = 0; // off by default

// ─── DEAL STAGES ─────────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new_lead: { label: "New Lead", color: "#6b7280" },
  contacted: { label: "Contacted", color: "#3b82f6" },
  qualified: { label: "Qualified", color: "#8b5cf6" },
  consultation_booked: { label: "Consultation Booked", color: "#f59e0b" },
  engaged: { label: "Engaged", color: "#f97316" },
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
