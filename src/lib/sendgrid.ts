/**
 * SendGrid Email Client (Phase 15a)
 *
 * Sends transactional partner emails via the SendGrid v3 REST API. Mirrors
 * the demo-mode pattern used by `signwell.ts` and `hubspot.ts`: when
 * `SENDGRID_API_KEY` is not set, all sends short-circuit to a "demo" status
 * and still write to the `EmailLog` table so the admin Communication Log
 * fills out during local development.
 *
 * Uses raw `fetch()` against `https://api.sendgrid.com/v3/mail/send` rather
 * than the `@sendgrid/mail` package to avoid pulling in a new dependency —
 * matches the existing house pattern.
 *
 * Every send (success, failure, demo) is persisted to `EmailLog` so failures
 * are debuggable and the partner communication log is the single source of
 * truth for outbound mail.
 */

import { prisma } from "@/lib/prisma";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";
const SENDGRID_FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL || "noreply@fintella.partners";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || FIRM_SHORT;

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
const BRAND_GOLD = "#c4a050";

async function getPartnerCcEmails(partnerCode: string | null | undefined): Promise<string[]> {
  if (!partnerCode) return [];
  try {
    const partner = await prisma.partner.findUnique({
      where: { partnerCode },
      select: { ccEmail: true },
    });
    return partner?.ccEmail ? [partner.ccEmail] : [];
  } catch { return []; }
}

export function isSendGridConfigured(): boolean {
  return !!SENDGRID_API_KEY;
}

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  /**
   * Plain-text body. REQUIRED — every transactional email is sent as
   * multipart/alternative, and the text part is also what we slice into
   * `EmailLog.bodyPreview`. Templates author this side-by-side with the HTML
   * rather than having us regex-strip tags out of the HTML (which would be
   * lossy and ReDoS-prone).
   */
  text: string;
  /** Logged to EmailLog.template — short identifier for the email kind. */
  template: string;
  /** Optional partner attribution for the EmailLog row. */
  partnerCode?: string | null;
  /** Override the default reply-to. */
  replyTo?: string;
  /**
   * Override the default From email (env var SENDGRID_FROM_EMAIL). Used by
   * EmailTemplate rows that have a per-template `fromEmail` override set.
   */
  fromEmail?: string;
  /**
   * Override the default From name (env var SENDGRID_FROM_NAME). Used by
   * EmailTemplate rows that have a per-template `fromName` override set.
   */
  fromName?: string;
  /** Optional CC addresses (e.g. partner's secondary email). */
  cc?: string[];
}

export interface SendEmailResult {
  status: "sent" | "demo" | "failed";
  messageId: string | null;
  error?: string;
}

/**
 * Send a single transactional email and persist the result to EmailLog.
 *
 * Always resolves — never throws. Callers should treat email as fire-and-forget;
 * a failure should never block the user-facing flow that triggered it.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const text = input.text;
  const bodyPreview = text.slice(0, 300);
  // Effective From / Reply-To: per-template overrides take precedence over
  // env-var defaults. EmailTemplate rows in the DB can set their own
  // fromEmail / fromName / replyTo without touching Vercel env vars.
  const effectiveFromEmail = input.fromEmail || SENDGRID_FROM_EMAIL;
  const effectiveFromName = input.fromName || SENDGRID_FROM_NAME;

  // ── Demo mode: log it and short-circuit ───────────────────────────────────
  if (!SENDGRID_API_KEY) {
    await logEmail({
      partnerCode: input.partnerCode ?? null,
      toEmail: input.to,
      fromEmail: effectiveFromEmail,
      subject: input.subject,
      bodyPreview,
      template: input.template,
      status: "demo",
      providerMessageId: null,
      errorMessage: null,
    });
    // email.failed trigger — "demo-mode" skips still count as a non-send
    // so automations can react to "no real email actually went out"
    // during local/preview testing.
    fireEmailTrigger("email.failed", {
      template: input.template || null,
      to: input.to,
      partnerCode: input.partnerCode ?? null,
      reason: "demo-mode",
      statusCode: 0,
    });
    return { status: "demo", messageId: null };
  }

  // ── Real send via SendGrid v3 API ─────────────────────────────────────────
  try {
    const personalization: Record<string, any> = {
      to: [{ email: input.to, name: input.toName || undefined }],
      subject: input.subject,
    };
    if (input.cc?.length) {
      personalization.cc = input.cc
        .filter((e) => e && e !== input.to)
        .map((e) => ({ email: e }));
    }
    const payload = {
      personalizations: [personalization],
      from: { email: effectiveFromEmail, name: effectiveFromName },
      reply_to: input.replyTo
        ? { email: input.replyTo }
        : { email: effectiveFromEmail, name: effectiveFromName },
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: input.html },
      ],
      mail_settings: {
        sandbox_mode: { enable: false },
      },
    };

    const res = await fetch(SENDGRID_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      const err = `SendGrid API error (${res.status}): ${errText.slice(0, 500)}`;
      await logEmail({
        partnerCode: input.partnerCode ?? null,
        toEmail: input.to,
        fromEmail: effectiveFromEmail,
        subject: input.subject,
        bodyPreview,
        template: input.template,
        status: "failed",
        providerMessageId: null,
        errorMessage: err,
      });
      console.error("[SendGrid]", err);
      fireEmailTrigger("email.failed", {
        template: input.template || null,
        to: input.to,
        partnerCode: input.partnerCode ?? null,
        reason: err,
        statusCode: res.status,
      });
      return { status: "failed", messageId: null, error: err };
    }

    // SendGrid returns 202 with an empty body and a message id in headers.
    const messageId = res.headers.get("x-message-id");
    await logEmail({
      partnerCode: input.partnerCode ?? null,
      toEmail: input.to,
      fromEmail: effectiveFromEmail,
      subject: input.subject,
      bodyPreview,
      template: input.template,
      status: "sent",
      providerMessageId: messageId,
      errorMessage: null,
    });
    fireEmailTrigger("email.sent", {
      template: input.template || null,
      to: input.to,
      partnerCode: input.partnerCode ?? null,
      messageId: messageId || null,
    });
    return { status: "sent", messageId };
  } catch (err: any) {
    const message = err?.message || String(err);
    await logEmail({
      partnerCode: input.partnerCode ?? null,
      toEmail: input.to,
      fromEmail: effectiveFromEmail,
      subject: input.subject,
      bodyPreview,
      template: input.template,
      status: "failed",
      providerMessageId: null,
      errorMessage: message,
    });
    console.error("[SendGrid] send threw:", message);
    fireEmailTrigger("email.failed", {
      template: input.template || null,
      to: input.to,
      partnerCode: input.partnerCode ?? null,
      reason: message,
      statusCode: 0,
    });
    return { status: "failed", messageId: null, error: message };
  }
}

/**
 * Fire-and-forget workflow trigger for email lifecycle events. Dynamic
 * import keeps this file from taking a compile-time dependency on the
 * workflow engine (which imports prisma and would circularly pull this
 * file back in during test builds). Swallow any failure — a broken
 * trigger must NEVER block the email pipeline.
 */
function fireEmailTrigger(triggerKey: string, payload: Record<string, unknown>): void {
  import("@/lib/workflow-engine")
    .then(({ fireWorkflowTrigger }) => fireWorkflowTrigger(triggerKey as any, payload))
    .catch((e) => console.error("[SendGrid] fireEmailTrigger dispatch failed:", e));
}

// ─── EmailLog persistence (best-effort, never throws) ────────────────────────

interface LogEmailRow {
  partnerCode: string | null;
  toEmail: string;
  fromEmail: string;
  subject: string;
  bodyPreview: string;
  template: string;
  status: "sent" | "demo" | "failed";
  providerMessageId: string | null;
  errorMessage: string | null;
}

async function logEmail(row: LogEmailRow): Promise<void> {
  try {
    await prisma.emailLog.create({ data: row });
  } catch (err) {
    // Logging failure must never break the caller. Surface to console only.
    console.error("[SendGrid] failed to write EmailLog row:", err);
  }
}

// ─── Shared HTML + text shells ───────────────────────────────────────────────
//
// Each template authors HTML and plain text side-by-side. We deliberately do
// NOT derive plain text by regex-stripping HTML — that path is lossy, was
// flagged by CodeQL for incomplete sanitization + ReDoS, and the multipart
// email spec wants both parts authored anyway.

interface ShellOpts {
  preheader?: string;
  heading: string;
  /** HTML body — already escaped, ready to drop into the shell. */
  bodyHtml: string;
  /** Plain-text body — already formatted with newlines. */
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

function buildHtml(opts: ShellOpts): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
           <tr><td style="background:${BRAND_GOLD};border-radius:6px;">
             <a href="${escapeAttr(opts.ctaUrl)}" style="display:inline-block;padding:12px 24px;color:#0a0a0a;font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:14px;text-decoration:none;">${escapeHtml(opts.ctaLabel)}</a>
           </td></tr>
         </table>`
      : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
      <tr><td style="background:#0a0a0a;padding:20px 32px;">
        <div style="font-family:Georgia,serif;font-size:22px;font-weight:600;color:${BRAND_GOLD};letter-spacing:0.5px;">${FIRM_SHORT}</div>
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">${FIRM_NAME}</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:600;color:#0a0a0a;margin:0 0 16px;">${escapeHtml(opts.heading)}</h1>
        <div style="font-size:14px;line-height:1.6;color:#333;">${opts.bodyHtml}</div>
        ${cta}
        <p style="font-size:12px;color:#666;margin-top:24px;padding-top:16px;border-top:1px solid #eee;">Please remember to bookmark the Fintella Partner Portal Login URL: <a href="${PORTAL_URL}/login" style="color:${BRAND_GOLD};text-decoration:none;">${PORTAL_URL.replace(/^https?:\/\//, "")}/login</a></p>
      </td></tr>
      <tr><td style="background:#fafafa;padding:20px 32px;border-top:1px solid #e5e5e5;font-size:11px;color:#888;font-family:Helvetica,Arial,sans-serif;line-height:1.5;">
        You're receiving this because you have a partner account at ${escapeHtml(FIRM_SHORT)}.<br>
        ${escapeHtml(FIRM_NAME)} &middot; <a href="${PORTAL_URL}" style="color:${BRAND_GOLD};text-decoration:none;">${PORTAL_URL.replace(/^https?:\/\//, "")}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildText(opts: ShellOpts): string {
  const lines: string[] = [];
  lines.push(opts.heading);
  lines.push("=".repeat(Math.min(opts.heading.length, 60)));
  lines.push("");
  lines.push(opts.bodyText.trim());
  if (opts.ctaLabel && opts.ctaUrl) {
    lines.push("");
    lines.push(`${opts.ctaLabel}: ${opts.ctaUrl}`);
  }
  lines.push("");
  lines.push(`Please remember to bookmark the Fintella Partner Portal Login URL: ${PORTAL_URL}/login`);
  lines.push("");
  lines.push("—");
  lines.push(`${FIRM_NAME} · ${PORTAL_URL.replace(/^https?:\/\//, "")}`);
  lines.push(
    `You're receiving this because you have a partner account at ${FIRM_SHORT}.`
  );
  return lines.join("\n");
}

/** Convenience wrapper: build both shells from a single ShellOpts. */
export function emailShell(opts: ShellOpts): { html: string; text: string } {
  return { html: buildHtml(opts), text: buildText(opts) };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// ─── Template lookup + variable interpolation ────────────────────────────────
//
// Each `sendXxxEmail()` helper below first tries to load its template by `key`
// from the `EmailTemplate` table. If the row exists and is enabled, the helper
// uses the persisted subject/heading/bodyHtml/bodyText/cta with `{variable}`
// interpolation against a vars map the caller builds from its inputs. If the
// row is missing, disabled, or the DB lookup throws (e.g. Neon hiccup), the
// helper falls back to the existing hardcoded content so partner-facing flows
// never break on a template-table outage.
//
// Per-template `fromEmail`, `fromName`, and `replyTo` overrides flow through
// to `sendEmail()` and take precedence over the env-var defaults — that's how
// the Communications Hub edit form lets admins set per-template senders
// without touching Vercel env vars.

interface TemplateLookup {
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
}

async function loadTemplate(key: string): Promise<TemplateLookup | null> {
  try {
    const tpl = await prisma.emailTemplate.findUnique({ where: { key } });
    if (!tpl || !tpl.enabled) return null;
    return {
      subject: tpl.subject,
      preheader: tpl.preheader,
      heading: tpl.heading,
      bodyHtml: tpl.bodyHtml,
      bodyText: tpl.bodyText,
      ctaLabel: tpl.ctaLabel,
      ctaUrl: tpl.ctaUrl,
      fromEmail: tpl.fromEmail,
      fromName: tpl.fromName,
      replyTo: tpl.replyTo,
    };
  } catch (err) {
    console.warn(`[SendGrid] template lookup failed for key=${key}, falling back to hardcoded:`, err);
    return null;
  }
}

/**
 * Linear-time {variable} interpolation. `escape` is applied to each value
 * before substitution — pass `escapeHtml` for HTML fields and an identity
 * function for plain text / pre-trusted URL fields. Unknown variables are
 * left intact so the admin can spot typos in their template.
 */
function interpolate(
  template: string,
  vars: Record<string, string>,
  escape: (s: string) => string = (s) => s
): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => {
    const v = vars[k];
    if (v === undefined || v === null) return m;
    return escape(String(v));
  });
}

// ─── Template helpers ────────────────────────────────────────────────────────

export interface PartnerEmailContext {
  partnerCode: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

function partnerDisplayName(p: PartnerEmailContext): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "Partner";
}

/**
 * Welcome email — fired on partner signup, before the agreement is signed.
 * Always sent (transactional / onboarding).
 *
 * Looks up the `welcome` template from EmailTemplate first; falls back to
 * the hardcoded content below if the row is missing, disabled, or the DB
 * lookup throws.
 */
export async function sendWelcomeEmail(
  partner: PartnerEmailContext
): Promise<SendEmailResult> {
  const cc = await getPartnerCcEmails(partner.partnerCode);
  const name = partnerDisplayName(partner);
  const vars: Record<string, string> = {
    firstName: partner.firstName || name,
    lastName: partner.lastName || "",
    partnerCode: partner.partnerCode,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("welcome");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || undefined,
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : undefined,
    });
    return sendEmail({
      to: partner.email,
      toName: name,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "welcome",
      partnerCode: partner.partnerCode,
      replyTo: tpl.replyTo || undefined,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
      cc,
    });
  }

  // ── Hardcoded fallback ──
  const heading = `Welcome to ${FIRM_SHORT}, ${name}`;
  const bodyHtml = `
    <p>Your partner account is now created. Your partner code is
       <strong style="font-family:'Courier New',monospace;background:#f5f5f5;padding:2px 6px;border-radius:3px;color:${BRAND_GOLD};">${escapeHtml(partner.partnerCode)}</strong>.</p>
    <p>Next step: your partnership agreement is on its way. Once it's signed
       you'll be able to start submitting clients and tracking commissions
       from your dashboard.</p>
    <p>If you have any questions, just reply to this email.</p>`;
  const bodyText = `Your partner account is now created. Your partner code is ${partner.partnerCode}.

Next step: your partnership agreement is on its way. Once it's signed you'll be able to start submitting clients and tracking commissions from your dashboard.

If you have any questions, just reply to this email.`;
  const { html, text } = emailShell({
    preheader: `Welcome to ${FIRM_SHORT}. Your partner code is ${partner.partnerCode}.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Open your dashboard",
    ctaUrl: `${PORTAL_URL}/login`,
  });
  return sendEmail({
    to: partner.email,
    toName: name,
    subject: `Welcome to ${FIRM_SHORT}`,
    html,
    text,
    template: "welcome",
    partnerCode: partner.partnerCode,
    cc,
  });
}

/**
 * Agreement-ready email — fired immediately after a SignWell document is sent
 * to the partner. Includes the embedded signing link when available, otherwise
 * directs them to log in.
 *
 * Looks up the `agreement_ready` template from EmailTemplate first; falls
 * back to hardcoded content if the row is missing.
 */
export async function sendAgreementReadyEmail(
  partner: PartnerEmailContext,
  signingUrl: string | null
): Promise<SendEmailResult> {
  const name = partnerDisplayName(partner);
  const vars: Record<string, string> = {
    firstName: partner.firstName || name,
    lastName: partner.lastName || "",
    partnerCode: partner.partnerCode,
    signingUrl: signingUrl || `${PORTAL_URL}/dashboard`,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("agreement_ready");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || undefined,
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : undefined,
    });
    return sendEmail({
      to: partner.email,
      toName: name,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "agreement_ready",
      partnerCode: partner.partnerCode,
      replyTo: tpl.replyTo || undefined,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = "Your partnership agreement is ready to sign";
  const bodyHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your ${escapeHtml(FIRM_SHORT)} partnership agreement is ready for your
       signature. Click the button below to review and sign — it should take
       under two minutes.</p>
    <p>Once it's signed, your account activates immediately and you can start
       submitting clients.</p>`;
  const bodyText = `Hi ${name},

Your ${FIRM_SHORT} partnership agreement is ready for your signature. Use the link below to review and sign — it should take under two minutes.

Once it's signed, your account activates immediately and you can start submitting clients.`;
  const { html, text } = emailShell({
    preheader: "Your Fintella partnership agreement is ready for signature.",
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Review & sign agreement",
    ctaUrl: signingUrl || `${PORTAL_URL}/dashboard`,
  });
  return sendEmail({
    to: partner.email,
    toName: name,
    subject: `${FIRM_SHORT} partnership agreement — ready to sign`,
    html,
    text,
    template: "agreement_ready",
    partnerCode: partner.partnerCode,
  });
}

/**
 * Agreement-signed email — fired from the SignWell webhook on
 * `document_completed`. Confirms activation and points them at the dashboard.
 *
 * Looks up the `agreement_signed` template from EmailTemplate first; falls
 * back to hardcoded content if the row is missing.
 */
export async function sendAgreementSignedEmail(
  partner: PartnerEmailContext
): Promise<SendEmailResult> {
  const name = partnerDisplayName(partner);
  const vars: Record<string, string> = {
    firstName: partner.firstName || name,
    lastName: partner.lastName || "",
    partnerCode: partner.partnerCode,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("agreement_signed");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || undefined,
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : undefined,
    });
    return sendEmail({
      to: partner.email,
      toName: name,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "agreement_signed",
      partnerCode: partner.partnerCode,
      replyTo: tpl.replyTo || undefined,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = "Your partner account is now active";
  const bodyHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your ${escapeHtml(FIRM_SHORT)} partnership agreement has been signed
       and your account is now <strong>active</strong>. You can submit
       clients, generate referral links, and track commissions from your
       dashboard.</p>
    <p>Welcome aboard.</p>`;
  const bodyText = `Hi ${name},

Your ${FIRM_SHORT} partnership agreement has been signed and your account is now ACTIVE. You can submit clients, generate referral links, and track commissions from your dashboard.

Welcome aboard.`;
  const { html, text } = emailShell({
    preheader: "Your partnership agreement has been signed. Welcome aboard.",
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Go to dashboard",
    ctaUrl: `${PORTAL_URL}/dashboard`,
  });
  return sendEmail({
    to: partner.email,
    toName: name,
    subject: `${FIRM_SHORT}: your partner account is active`,
    html,
    text,
    template: "agreement_signed",
    partnerCode: partner.partnerCode,
  });
}

/**
 * L1 inviter notification — fired when a recruit completes signup via an
 * invite link. Tells the L1 a new downline partner just joined and reminds
 * them to upload the signed agreement.
 *
 * Looks up the `signup_notification` template from EmailTemplate first;
 * falls back to hardcoded content if the row is missing.
 */
export async function sendInviterSignupNotificationEmail(opts: {
  inviterEmail: string;
  inviterName: string;
  inviterCode: string;
  recruitName: string;
  recruitTier: string; // "l2" | "l3"
  commissionRate: number; // 0.10..0.25
}): Promise<SendEmailResult> {
  const ratePct = Math.round(opts.commissionRate * 100);
  const vars: Record<string, string> = {
    inviterName: opts.inviterName,
    inviterCode: opts.inviterCode,
    recruitName: opts.recruitName,
    recruitTier: opts.recruitTier,
    recruitTierUpper: opts.recruitTier.toUpperCase(),
    commissionRate: String(opts.commissionRate),
    commissionRatePct: `${ratePct}%`,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("signup_notification");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || undefined,
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : undefined,
    });
    return sendEmail({
      to: opts.inviterEmail,
      toName: opts.inviterName,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "signup_notification",
      partnerCode: opts.inviterCode,
      replyTo: tpl.replyTo || undefined,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = "A new partner just joined your downline";
  const bodyHtml = `
    <p>Hi ${escapeHtml(opts.inviterName)},</p>
    <p><strong>${escapeHtml(opts.recruitName)}</strong> has signed up as your
       ${escapeHtml(opts.recruitTier.toUpperCase())} partner at
       ${ratePct}% commission.</p>
    <p>Next step: upload their countersigned partnership agreement from your
       Downline page so we can activate their account.</p>`;
  const bodyText = `Hi ${opts.inviterName},

${opts.recruitName} has signed up as your ${opts.recruitTier.toUpperCase()} partner at ${ratePct}% commission.

Next step: upload their countersigned partnership agreement from your Downline page so we can activate their account.`;
  const { html, text } = emailShell({
    preheader: `${opts.recruitName} joined your downline at ${ratePct}%.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Open downline",
    ctaUrl: `${PORTAL_URL}/dashboard/downline`,
  });
  return sendEmail({
    to: opts.inviterEmail,
    toName: opts.inviterName,
    subject: `New downline partner: ${opts.recruitName}`,
    html,
    text,
    template: "signup_notification",
    partnerCode: opts.inviterCode,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Deal status update — fired from webhook/referral PATCH on stage change
// ═══════════════════════════════════════════════════════════════════════════

export async function sendDealStatusUpdateEmail(opts: {
  partnerEmail: string;
  partnerName: string;
  partnerCode: string;
  dealName: string;
  newStage: string;
}): Promise<SendEmailResult> {
  const cc = await getPartnerCcEmails(opts.partnerCode);
  const firstName = opts.partnerName.split(" ")[0] || opts.partnerName;
  const vars: Record<string, string> = {
    firstName,
    lastName: opts.partnerName.split(" ").slice(1).join(" "),
    partnerCode: opts.partnerCode,
    dealName: opts.dealName,
    newStage: opts.newStage,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("deal_status_update");
  if (!tpl) {
    // No DB template — skip the send. There's no hardcoded fallback for
    // this template because it's admin-editable draft content; if the
    // row is missing or disabled we prefer silence over surprising partners.
    return { status: "demo", messageId: null };
  }

  const { html, text } = emailShell({
    preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
    heading: interpolate(tpl.heading, vars),
    bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
    bodyText: interpolate(tpl.bodyText, vars),
    ctaLabel: tpl.ctaLabel || undefined,
    ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : undefined,
  });
  return sendEmail({
    to: opts.partnerEmail,
    toName: opts.partnerName,
    subject: interpolate(tpl.subject, vars),
    html,
    text,
    template: "deal_status_update",
    partnerCode: opts.partnerCode,
    replyTo: tpl.replyTo || undefined,
    fromEmail: tpl.fromEmail || undefined,
    fromName: tpl.fromName || undefined,
    cc,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Commission payment notification — fired when payout batch flips a ledger
// row to status=paid
// ═══════════════════════════════════════════════════════════════════════════

export async function sendCommissionPaidEmail(opts: {
  partnerEmail: string;
  partnerName: string;
  partnerCode: string;
  amount: number;
  dealName: string;
}): Promise<SendEmailResult> {
  const cc = await getPartnerCcEmails(opts.partnerCode);
  const firstName = opts.partnerName.split(" ")[0] || opts.partnerName;
  const vars: Record<string, string> = {
    firstName,
    lastName: opts.partnerName.split(" ").slice(1).join(" "),
    partnerCode: opts.partnerCode,
    amount: `$${opts.amount.toFixed(2)}`,
    dealName: opts.dealName,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("commission_payment_notification");
  if (!tpl) return { status: "demo", messageId: null };

  const { html, text } = emailShell({
    preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
    heading: interpolate(tpl.heading, vars),
    bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
    bodyText: interpolate(tpl.bodyText, vars),
    ctaLabel: tpl.ctaLabel || undefined,
    ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : undefined,
  });
  return sendEmail({
    to: opts.partnerEmail,
    toName: opts.partnerName,
    subject: interpolate(tpl.subject, vars),
    html,
    text,
    template: "commission_payment_notification",
    partnerCode: opts.partnerCode,
    replyTo: tpl.replyTo || undefined,
    fromEmail: tpl.fromEmail || undefined,
    fromName: tpl.fromName || undefined,
    cc,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// L1 partner invite — fired by admin when they create a new L1 invite
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Admin-initiated invite email for prospective L1 partners.
 * Sent the moment an admin creates an invite via /api/admin/invites.
 *
 * Looks up the `l1_invite` template from EmailTemplate first; falls
 * back to hardcoded content if the row is missing/disabled.
 */
export async function sendL1InviteEmail(opts: {
  toEmail: string;
  toName: string | null;
  signupUrl: string;
  commissionRate?: number;
}): Promise<SendEmailResult> {
  const name = opts.toName || "there";
  const ratePct = opts.commissionRate ? `${Math.round(opts.commissionRate * 100)}%` : "20%";
  const vars: Record<string, string> = {
    firstName: name,
    signupUrl: opts.signupUrl,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
    commissionRate: ratePct,
    commissionRatePct: ratePct,
  };

  const tpl = await loadTemplate("l1_invite");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || "Accept Invitation",
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : opts.signupUrl,
    });
    return sendEmail({
      to: opts.toEmail,
      toName: opts.toName || undefined,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "l1_invite",
      partnerCode: null,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
      replyTo: tpl.replyTo || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = `You've been invited to join ${FIRM_SHORT}`;
  const bodyHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>You've been invited to become a Partner with ${escapeHtml(FIRM_NAME)}. As a partner, you'll earn ${ratePct} of the firm fee on every client referral you send us.</p>
    <p>Click the button below to create your account. The process takes about two minutes — you'll fill out a short form and sign your partnership agreement digitally.</p>
    <p style="font-size:12px;color:#888;">This invitation link expires in 7 days.</p>`;
  const bodyText = `Hi ${name},

You've been invited to become a Partner with ${FIRM_NAME}. As a partner, you'll earn ${ratePct} of the firm fee on every client referral you send us.

Use the link below to create your account and sign your partnership agreement (takes about two minutes):
${opts.signupUrl}

This invitation link expires in 7 days.`;

  const { html, text } = emailShell({
    preheader: `You've been invited to join ${FIRM_SHORT} as a Partner — earn ${ratePct} per deal.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Accept Invitation",
    ctaUrl: opts.signupUrl,
  });

  return sendEmail({
    to: opts.toEmail,
    toName: opts.toName || undefined,
    subject: `You're invited to join ${FIRM_SHORT} as a Partner`,
    html,
    text,
    template: "l1_invite",
    partnerCode: null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Landing page invite — share the public landing/apply page via email.
// Template key: landing_invite. Falls back to hardcoded copy below.
// ═══════════════════════════════════════════════════════════════════════════

export async function sendLandingInviteEmail(opts: {
  toEmail: string;
  toName: string | null;
  landingUrl: string;
  senderName?: string;
}): Promise<SendEmailResult> {
  const name = opts.toName || "there";
  const sender = opts.senderName || "Someone";
  const vars: Record<string, string> = {
    firstName: name,
    landingUrl: opts.landingUrl,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
    senderName: sender,
  };

  const tpl = await loadTemplate("landing_invite");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || "Learn More & Apply",
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : opts.landingUrl,
    });
    return sendEmail({
      to: opts.toEmail,
      toName: opts.toName || undefined,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "landing_invite",
      partnerCode: null,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
      replyTo: tpl.replyTo || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = "You've been invited to explore a partnership opportunity";
  const bodyHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>${escapeHtml(sender)} thought you'd be a great fit for the ${escapeHtml(FIRM_NAME)} partner network.</p>
    <p>As a ${escapeHtml(FIRM_SHORT)} partner, you can earn commissions on every qualified referral you send our way. It only takes a few minutes to learn more and apply.</p>
    <p>Click the button below to check out the opportunity and get started.</p>`;
  const bodyText = `Hi ${name},

${sender} thought you'd be a great fit for the ${FIRM_NAME} partner network.

As a ${FIRM_SHORT} partner, you can earn commissions on every qualified referral you send our way. It only takes a few minutes to learn more and apply.

Learn more and apply: ${opts.landingUrl}`;

  const { html, text } = emailShell({
    preheader: `${sender} thinks you'd be a great fit for the ${FIRM_SHORT} partner network.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Learn More & Apply",
    ctaUrl: opts.landingUrl,
  });

  return sendEmail({
    to: opts.toEmail,
    toName: opts.toName || undefined,
    subject: "Explore a partnership opportunity with Fintella",
    html,
    text,
    template: "landing_invite",
    partnerCode: null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Channel-invite email — fired from the /api/admin/channels/[id]/members
// POST endpoint whenever a new partner is added to an AnnouncementChannel.
// Template key: partner_added_to_channel. Falls back to the hardcoded copy
// below if the template row is missing/disabled.
// ═══════════════════════════════════════════════════════════════════════════

export async function sendChannelInviteEmail(opts: {
  toEmail: string;
  toName: string | null;
  channelName: string;
  channelUrl: string;
  partnerCode: string;
}): Promise<SendEmailResult> {
  const name = opts.toName || "there";
  const vars: Record<string, string> = {
    firstName: name,
    channelName: opts.channelName,
    channelUrl: opts.channelUrl,
    partnerCode: opts.partnerCode,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("partner_added_to_channel");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || "Open Channel",
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : opts.channelUrl,
    });
    return sendEmail({
      to: opts.toEmail,
      toName: opts.toName || undefined,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "partner_added_to_channel",
      partnerCode: opts.partnerCode,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
      replyTo: tpl.replyTo || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = `You've been added to the "${opts.channelName}" channel`;
  const bodyHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>An admin just added you to the <strong>${escapeHtml(opts.channelName)}</strong> announcement channel on ${escapeHtml(FIRM_SHORT)}.</p>
    <p>Announcements posted there will now show up in your Announcements tab. You can reply to start a private thread with the admin team on any post.</p>
    <p style="font-size:12px;color:#888;">Where to go: open the portal → sidebar → <strong>Communications &rarr; Announcements</strong>, or tap the button below.</p>`;
  const bodyText = `Hi ${name},

An admin just added you to the "${opts.channelName}" announcement channel on ${FIRM_SHORT}.

Announcements posted there will now show up in your Announcements tab. You can reply to start a private thread with the admin team on any post.

Open the channel: ${opts.channelUrl}

Where to go: portal sidebar → Communications → Announcements.`;

  const { html, text } = emailShell({
    preheader: `You've been added to the "${opts.channelName}" channel.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Open Channel",
    ctaUrl: opts.channelUrl,
  });

  return sendEmail({
    to: opts.toEmail,
    toName: opts.toName || undefined,
    subject: `You've been added to the "${opts.channelName}" channel`,
    html,
    text,
    template: "partner_added_to_channel",
    partnerCode: opts.partnerCode,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Monthly newsletter — fired by Vercel cron on the 1st of each month,
// iterates every active partner and sends one email each
// ═══════════════════════════════════════════════════════════════════════════

export async function sendMonthlyNewsletterToAllPartners(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const { prisma } = await import("@/lib/prisma");
  const tpl = await loadTemplate("monthly_newsletter");
  if (!tpl) return { sent: 0, failed: 0, skipped: 0 };

  const activePartners = await prisma.partner.findMany({
    where: { status: "active" },
    select: { partnerCode: true, firstName: true, lastName: true, email: true, ccEmail: true },
  });

  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const year = String(now.getFullYear());

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const p of activePartners) {
    if (!p.email) { skipped++; continue; }
    const vars: Record<string, string> = {
      firstName: p.firstName,
      lastName: p.lastName,
      partnerCode: p.partnerCode,
      month: monthName,
      year,
      portalUrl: PORTAL_URL,
      firmShort: FIRM_SHORT,
      firmName: FIRM_NAME,
    };
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || undefined,
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : undefined,
    });
    const result = await sendEmail({
      to: p.email,
      toName: `${p.firstName} ${p.lastName}`,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "monthly_newsletter",
      partnerCode: p.partnerCode,
      replyTo: tpl.replyTo || undefined,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
      cc: p.ccEmail ? [p.ccEmail] : undefined,
    });
    if (result.status === "sent" || result.status === "demo") sent++;
    else failed++;
  }
  return { sent, failed, skipped };
}

/**
 * Password-reset email — fired by POST /api/auth/forgot-password.
 * Single-use link with a 24-hour TTL. Looks up the `password_reset`
 * template from EmailTemplate so admins can edit copy; falls back to
 * a hardcoded body if the row is missing or disabled so a DB mishap
 * can never silently break recovery.
 */
export async function sendPasswordResetEmail(opts: {
  email: string;
  name: string | null;
  resetUrl: string;
  role: "partner" | "admin";
}): Promise<SendEmailResult> {
  const displayName = opts.name?.trim() || "there";
  const firstName = opts.name?.trim().split(/\s+/)[0] || "there";
  const vars: Record<string, string> = {
    firstName,
    fullName: displayName,
    resetUrl: opts.resetUrl,
    role: opts.role,
    roleLabel: opts.role === "admin" ? "admin" : "partner",
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
    portalUrl: PORTAL_URL,
  };

  const tpl = await loadTemplate("password_reset");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || "Reset password",
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : opts.resetUrl,
    });
    return sendEmail({
      to: opts.email,
      toName: opts.name || undefined,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "password_reset",
      replyTo: tpl.replyTo || undefined,
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = "Reset your password";
  const bodyHtml = `
    <p>Hi ${escapeHtml(displayName)},</p>
    <p>We received a request to reset the password for your ${opts.role === "admin" ? "admin" : "partner"} account at ${escapeHtml(FIRM_SHORT)}.</p>
    <p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong> and can only be used once.</p>
    <p style="color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`;
  const bodyText = `Hi ${displayName},

We received a request to reset the password for your ${opts.role === "admin" ? "admin" : "partner"} account at ${FIRM_SHORT}.

Open this link to choose a new password (expires in 24 hours, single-use):
${opts.resetUrl}

If you didn't request this, you can safely ignore this email — your password won't change.`;
  const { html, text } = emailShell({
    preheader: `Reset your ${FIRM_SHORT} password — link expires in 24 hours.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Reset password",
    ctaUrl: opts.resetUrl,
  });
  return sendEmail({
    to: opts.email,
    toName: opts.name || undefined,
    subject: `Reset your ${FIRM_SHORT} password`,
    html,
    text,
    template: "password_reset",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// No-show rebooking — sent when an application is marked as no_show.
// Template key: no_show_rebooking. Falls back to hardcoded copy below.
// ═══════════════════════════════════════════════════════════════════════════

export async function sendNoShowRebookingEmail(opts: {
  toEmail: string;
  toName: string | null;
  rebookUrl: string;
}): Promise<SendEmailResult> {
  const name = opts.toName || "there";
  const vars: Record<string, string> = {
    firstName: name,
    rebookUrl: opts.rebookUrl,
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("no_show_rebooking");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || "Reschedule Now",
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : opts.rebookUrl,
    });
    return sendEmail({
      to: opts.toEmail,
      toName: opts.toName || undefined,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "no_show_rebooking",
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
      replyTo: tpl.replyTo || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = "We missed you — let's reschedule";
  const bodyHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>It looks like we weren't able to connect for your scheduled qualification call. No worries — we'd love to find another time that works for you.</p>
    <p>Click the button below to pick a new time slot. It only takes a moment, and we're excited to walk you through the partner opportunity.</p>
    <p style="font-size:12px;color:#888;">If you're no longer interested, you can simply ignore this email.</p>`;
  const bodyText = `Hi ${name},

It looks like we weren't able to connect for your scheduled qualification call. No worries — we'd love to find another time that works for you.

Use the link below to pick a new time slot:
${opts.rebookUrl}

If you're no longer interested, you can simply ignore this email.`;

  const { html, text } = emailShell({
    preheader: `We missed your call — reschedule in one click.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Reschedule Now",
    ctaUrl: opts.rebookUrl,
  });

  return sendEmail({
    to: opts.toEmail,
    toName: opts.toName || undefined,
    subject: `We missed you — let's reschedule your ${FIRM_SHORT} call`,
    html,
    text,
    template: "no_show_rebooking",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Agreement reminder — nudges partners who haven't signed yet.
// Template key: agreement_reminder. Falls back to hardcoded copy below.
// Called by /api/cron/reminders when partner.agreement_reminder workflow fires.
// ═══════════════════════════════════════════════════════════════════════════

export async function sendAgreementReminderEmail(opts: {
  toEmail: string;
  toName: string | null;
  signingUrl: string;
  daysSinceSent: number;
}): Promise<SendEmailResult> {
  const name = opts.toName || "there";
  const vars: Record<string, string> = {
    firstName: name,
    signingUrl: opts.signingUrl,
    daysSinceSent: String(opts.daysSinceSent),
    portalUrl: PORTAL_URL,
    firmShort: FIRM_SHORT,
    firmName: FIRM_NAME,
  };

  const tpl = await loadTemplate("agreement_reminder");
  if (tpl) {
    const { html, text } = emailShell({
      preheader: tpl.preheader ? interpolate(tpl.preheader, vars) : undefined,
      heading: interpolate(tpl.heading, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars, escapeHtml),
      bodyText: interpolate(tpl.bodyText, vars),
      ctaLabel: tpl.ctaLabel || "Sign Agreement",
      ctaUrl: tpl.ctaUrl ? interpolate(tpl.ctaUrl, vars) : opts.signingUrl,
    });
    return sendEmail({
      to: opts.toEmail,
      toName: opts.toName || undefined,
      subject: interpolate(tpl.subject, vars),
      html,
      text,
      template: "agreement_reminder",
      fromEmail: tpl.fromEmail || undefined,
      fromName: tpl.fromName || undefined,
      replyTo: tpl.replyTo || undefined,
    });
  }

  // ── Hardcoded fallback ──
  const heading = "Your partnership agreement is waiting";
  const bodyHtml = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>We sent your ${escapeHtml(FIRM_SHORT)} partnership agreement ${opts.daysSinceSent} day${opts.daysSinceSent === 1 ? "" : "s"} ago and haven't received your signature yet.</p>
    <p>Signing takes less than two minutes and unlocks your partner portal — including your referral links, commission tracking, and training resources.</p>
    <p>Click the button below to review and sign your agreement now.</p>
    <p style="font-size:12px;color:#888;">If you have questions, reply to this email or use the live chat in your portal.</p>`;
  const bodyText = `Hi ${name},

We sent your ${FIRM_SHORT} partnership agreement ${opts.daysSinceSent} day${opts.daysSinceSent === 1 ? "" : "s"} ago and haven't received your signature yet.

Signing takes less than two minutes and unlocks your partner portal.

Sign now: ${opts.signingUrl}

If you have questions, reply to this email or use the live chat in your portal.`;

  const { html, text } = emailShell({
    preheader: `Your ${FIRM_SHORT} agreement is waiting for your signature.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Sign Agreement",
    ctaUrl: opts.signingUrl,
  });

  return sendEmail({
    to: opts.toEmail,
    toName: opts.toName || undefined,
    subject: `Reminder: Your ${FIRM_SHORT} partnership agreement is waiting`,
    html,
    text,
    template: "agreement_reminder",
  });
}
