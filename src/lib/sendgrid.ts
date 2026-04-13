/**
 * SendGrid Email Client
 *
 * Wraps @sendgrid/mail with:
 *   - Demo mode (no API key) → logs to stdout + EmailLog table, never hits the network
 *   - emailOptIn gating → respects the partner's emailOptIn flag (admin one-off sends bypass)
 *   - Auto-logging → every send (success, failure, demo, or opt-out skip) writes an EmailLog row
 *
 * Mirror the same shape as src/lib/signwell.ts: env-var check, isConfigured()
 * helper, demo fallback, typed options. Callers should never touch
 * @sendgrid/mail directly — they call sendEmail() from this module.
 *
 * Pre-launch note: see CLAUDE.md "Development Status" — every send goes against
 * test data only until real customers exist. Demo mode is the safe default.
 */

import sgMail from "@sendgrid/mail";
import { prisma } from "@/lib/prisma";
import { FIRM_SHORT } from "@/lib/constants";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@fintella.partners";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || `${FIRM_SHORT} Partner Portal`;

// Initialize the SDK once at module load time. Safe to call with empty key —
// the SDK only validates on first send. We gate every actual send on the
// isSendGridConfigured() check below.
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * Check whether SendGrid is configured with a real API key. When false,
 * sendEmail() runs in demo mode (logs only, no network calls, no partner
 * mailbox impact). Same pattern as isSignWellConfigured() in signwell.ts.
 */
export function isSendGridConfigured(): boolean {
  return !!SENDGRID_API_KEY;
}

/**
 * Get the configured "from" address — useful for displaying in admin UIs
 * so John can verify the env vars are set correctly without leaking the
 * API key itself.
 */
export function getSendGridFromAddress(): { email: string; name: string } {
  return { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME };
}

/**
 * The full set of email types that can be sent through this module. Every
 * EmailLog row's `emailType` field comes from this list. Keep in sync with
 * the schema comment on EmailLog.emailType in prisma/schema.prisma.
 */
export type EmailType =
  | "welcome"
  | "agreement_signed"
  | "deal_received"
  | "payout_processed"
  | "admin_oneoff"
  | "test";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Type of email — drives EmailLog.emailType */
  type: EmailType;
  /** Partner this email belongs to. Null for system / test sends. */
  partnerCode?: string | null;
  /**
   * If true, this send bypasses the partner.emailOptIn gate. Use only for
   * admin-triggered one-off sends and dev test harness sends. Automated
   * trigger-point sends (signup, signwell, referral, payouts) should always
   * leave this false so opted-out partners are skipped.
   */
  bypassOptInGate?: boolean;
  /** Admin user id when this send was triggered manually from an admin UI */
  sentByAdminId?: string | null;
  /** Admin display name (denormalized for log rendering) */
  sentByAdminName?: string | null;
}

export interface SendEmailResult {
  success: boolean;
  status: "sent" | "failed" | "demo" | "skipped_optout";
  messageId: string | null;
  errorMessage: string | null;
  emailLogId: string | null;
}

/**
 * Send an email through SendGrid (or demo mode) and persist an EmailLog row.
 *
 * Behavior matrix:
 *   - SENDGRID_API_KEY unset             → demo log, EmailLog status="demo", success=true
 *   - partner.emailOptIn === false       → skipped, EmailLog status="skipped_optout", success=true
 *   - SendGrid send throws / non-2xx     → EmailLog status="failed", success=false, errorMessage set
 *   - everything OK                      → EmailLog status="sent", success=true, messageId set
 *
 * The function NEVER throws — callers can fire-and-forget it from inside
 * webhook handlers without try/catch. Errors are surfaced in the result
 * object and logged to console (and Sentry if configured).
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const {
    to,
    subject,
    html,
    text,
    type,
    partnerCode = null,
    bypassOptInGate = false,
    sentByAdminId = null,
    sentByAdminName = null,
  } = options;

  // ── Step 1: opt-in gate ────────────────────────────────────────────────
  // Admin one-off sends and test harness sends bypass this. Automated
  // trigger sends (signup welcome, agreement signed, etc.) respect it.
  if (!bypassOptInGate && partnerCode) {
    const partner = await prisma.partner
      .findUnique({
        where: { partnerCode },
        select: { emailOptIn: true },
      })
      .catch(() => null);

    if (partner && partner.emailOptIn === false) {
      const log = await logEmail({
        partnerCode,
        to,
        subject,
        text,
        type,
        status: "skipped_optout",
        sendgridMessageId: null,
        errorMessage: null,
        sentByAdminId,
        sentByAdminName,
      });
      return {
        success: true,
        status: "skipped_optout",
        messageId: null,
        errorMessage: null,
        emailLogId: log?.id || null,
      };
    }
  }

  // ── Step 2: demo mode (no API key) ─────────────────────────────────────
  if (!SENDGRID_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(
      `[sendgrid demo] would have sent → to="${to}" type="${type}" subject="${subject.substring(0, 60)}${subject.length > 60 ? "…" : ""}" partnerCode="${partnerCode || "(none)"}"`
    );
    const log = await logEmail({
      partnerCode,
      to,
      subject,
      text,
      type,
      status: "demo",
      sendgridMessageId: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      errorMessage: null,
      sentByAdminId,
      sentByAdminName,
    });
    return {
      success: true,
      status: "demo",
      messageId: log?.sendgridMessageId || null,
      errorMessage: null,
      emailLogId: log?.id || null,
    };
  }

  // ── Step 3: live send via SendGrid SDK ─────────────────────────────────
  try {
    const [response] = await sgMail.send({
      to,
      from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
      subject,
      text,
      html,
      // Disable click tracking for transactional emails — adds noise to URLs
      // and can trigger spam filters on URL rewrite. SendGrid still tracks
      // opens via the pixel by default; we don't need click tracking for
      // transactional sends.
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
      },
    });

    const messageId =
      (response.headers?.["x-message-id"] as string | undefined) || null;

    const log = await logEmail({
      partnerCode,
      to,
      subject,
      text,
      type,
      status: "sent",
      sendgridMessageId: messageId,
      errorMessage: null,
      sentByAdminId,
      sentByAdminName,
    });

    return {
      success: true,
      status: "sent",
      messageId,
      errorMessage: null,
      emailLogId: log?.id || null,
    };
  } catch (err: any) {
    // SendGrid SDK errors include a `response.body.errors` array with details.
    const sgErrorBody = err?.response?.body;
    const sgErrorText =
      sgErrorBody?.errors?.map((e: any) => e.message).join("; ") ||
      err?.message ||
      "Unknown SendGrid error";

    // eslint-disable-next-line no-console
    console.error(
      `[sendgrid] send failed → to="${to}" type="${type}" error="${sgErrorText}"`
    );

    const log = await logEmail({
      partnerCode,
      to,
      subject,
      text,
      type,
      status: "failed",
      sendgridMessageId: null,
      errorMessage: sgErrorText.substring(0, 1000),
      sentByAdminId,
      sentByAdminName,
    });

    return {
      success: false,
      status: "failed",
      messageId: null,
      errorMessage: sgErrorText,
      emailLogId: log?.id || null,
    };
  }
}

// ─── Internal: log to EmailLog table ───────────────────────────────────────
// Wrapped in its own try/catch so a DB write failure never breaks the caller.
// If logging fails, we still return the original send result — the email
// itself was either sent or wasn't, independent of whether the audit row
// landed.
async function logEmail(args: {
  partnerCode: string | null;
  to: string;
  subject: string;
  text: string;
  type: EmailType;
  status: "sent" | "failed" | "demo" | "skipped_optout";
  sendgridMessageId: string | null;
  errorMessage: string | null;
  sentByAdminId: string | null;
  sentByAdminName: string | null;
}) {
  try {
    return await prisma.emailLog.create({
      data: {
        partnerCode: args.partnerCode,
        recipientEmail: args.to,
        fromEmail: SENDGRID_FROM_EMAIL,
        fromName: SENDGRID_FROM_NAME,
        emailType: args.type,
        subject: args.subject,
        bodyPreview: args.text.substring(0, 200),
        sendgridMessageId: args.sendgridMessageId,
        status: args.status,
        errorMessage: args.errorMessage,
        sentByAdminId: args.sentByAdminId,
        sentByAdminName: args.sentByAdminName,
      },
    });
  } catch (logErr) {
    // eslint-disable-next-line no-console
    console.error("[sendgrid] failed to write EmailLog row:", logErr);
    return null;
  }
}
