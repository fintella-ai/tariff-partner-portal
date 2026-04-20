/**
 * Shared types + constants for the Communications hub sections.
 *
 * Each section (inbox, compose, templates, SMS, phone) used to live inside
 * a single 1700-line `EmailTemplatesTab` component. After the April 2026
 * split each section is its own file and imports these helpers as needed.
 */

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export type Email = {
  id: string;
  fromName: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  partnerCode: string | null;
  supportTicketId: string | null;
  read: boolean;
  replied: boolean;
  createdAt: string;
};

// EmailTemplate row shape (matches the Prisma model + the API response from
// /api/admin/email-templates). The wired transactional templates (welcome,
// agreement_ready, agreement_signed, signup_notification) drive real partner
// emails via src/lib/sendgrid.ts; drafts are placeholders for future
// automation work.
export type Template = {
  id: string;
  key: string;
  name: string;
  category: string;
  subject: string;
  preheader: string | null;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  enabled: boolean;
  isDraft: boolean;
  description: string | null;
  variables: string | null; // JSON-stringified array of variable names
  createdAt: string;
  updatedAt: string;
};

export type SmsPartner = {
  id: string;
  name: string;
  phone: string;
  optInDate: string;
  messagesSent: number;
};

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

export const categoryOptions = [
  "Onboarding",
  "Deal Updates",
  "Commissions",
  "Company Updates",
  "Promotions",
];

export const categoryBadge: Record<string, string> = {
  Onboarding: "bg-blue-500/20 text-blue-400",
  "Deal Updates": "bg-purple-500/20 text-purple-400",
  Commissions: "bg-green-500/20 text-green-400",
  "Company Updates": "bg-orange-500/20 text-orange-400",
  Promotions: "bg-pink-500/20 text-pink-400",
};

export const demoSmsPartners: SmsPartner[] = [
  {
    id: "SMS-001",
    name: "Sarah Chen",
    phone: "(4**) ***-**47",
    optInDate: "2026-01-15",
    messagesSent: 12,
  },
  {
    id: "SMS-002",
    name: "Mike Torres",
    phone: "(3**) ***-**19",
    optInDate: "2026-02-03",
    messagesSent: 8,
  },
  {
    id: "SMS-003",
    name: "Lisa Park",
    phone: "(7**) ***-**82",
    optInDate: "2026-02-20",
    messagesSent: 5,
  },
];

