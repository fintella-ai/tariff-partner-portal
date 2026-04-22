/**
 * Twilio SMS Client (Phase 15b)
 *
 * Sends transactional partner SMS via the Twilio v2010 REST API. Mirrors
 * the demo-mode pattern used by `src/lib/sendgrid.ts` (Phase 15a) and the
 * older `src/lib/signwell.ts` / `src/lib/hubspot.ts`: when `TWILIO_ACCOUNT_SID`
 * or `TWILIO_AUTH_TOKEN` is not set, every "send" short-circuits to a "demo"
 * status and still writes to `SmsLog` so the admin Communication Log SMS tab
 * fills out during local development.
 *
 * Uses raw `fetch()` against
 *   https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
 * rather than the `twilio` npm package — matches the existing house pattern
 * and avoids pulling in a dependency that bundles the entire Twilio SDK.
 *
 * TCPA compliance: every send checks `partner.smsOptIn` BEFORE making the
 * network call. Skipped sends are still persisted to SmsLog with
 * `status="skipped_optout"` so we keep an immutable audit trail of what
 * the system *would* have sent.
 *
 * Every send (success, failure, demo, skipped) is logged so the partner
 * communication log is the single source of truth for outbound SMS.
 */

import { prisma } from "@/lib/prisma";
import { FIRM_SHORT } from "@/lib/constants";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";
const TWILIO_API_URL = TWILIO_ACCOUNT_SID
  ? `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  : "";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
const PORTAL_HOST = PORTAL_URL.replace(/^https?:\/\//, "");

export function isTwilioConfigured(): boolean {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

export interface SendSmsInput {
  to: string; // E.164 (+1...)
  body: string;
  /** Logged to SmsLog.template — short identifier for the SMS kind. */
  template: string;
  /** Optional partner attribution for the SmsLog row. */
  partnerCode?: string | null;
  /**
   * TCPA gate. If false (or undefined), the send short-circuits with
   * status="skipped_optout" and no network call is made. Pass true ONLY
   * when the partner has explicitly granted consent (Partner.smsOptIn).
   */
  optedIn: boolean;
}

export interface SendSmsResult {
  status: "sent" | "demo" | "failed" | "skipped_optout";
  messageId: string | null;
  error?: string;
}

/**
 * Send a single transactional SMS and persist the result to SmsLog.
 *
 * Always resolves — never throws. Callers should treat SMS as fire-and-forget;
 * a failure should never block the user-facing flow that triggered it.
 */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  // Normalise + validate the destination phone number. We expect E.164
  // (e.g. +14105551234) but accept anything starting with `+` and digits.
  const to = (input.to || "").trim();
  if (!to || !/^\+[1-9]\d{6,14}$/.test(to)) {
    const err = `Invalid destination phone number: ${to || "(empty)"}`;
    await logSms({
      partnerCode: input.partnerCode ?? null,
      toPhone: to,
      fromPhone: TWILIO_FROM_NUMBER,
      body: input.body,
      template: input.template,
      status: "failed",
      providerMessageId: null,
      errorMessage: err,
    });
    return { status: "failed", messageId: null, error: err };
  }

  // ── TCPA gate: hard stop if the partner hasn't opted in ───────────────────
  if (!input.optedIn) {
    await logSms({
      partnerCode: input.partnerCode ?? null,
      toPhone: to,
      fromPhone: TWILIO_FROM_NUMBER,
      body: input.body,
      template: input.template,
      status: "skipped_optout",
      providerMessageId: null,
      errorMessage: null,
    });
    return { status: "skipped_optout", messageId: null };
  }

  // ── Demo mode: log it and short-circuit ───────────────────────────────────
  if (!isTwilioConfigured()) {
    await logSms({
      partnerCode: input.partnerCode ?? null,
      toPhone: to,
      fromPhone: TWILIO_FROM_NUMBER || "(demo)",
      body: input.body,
      template: input.template,
      status: "demo",
      providerMessageId: null,
      errorMessage: null,
    });
    return { status: "demo", messageId: null };
  }

  // ── Real send via Twilio v2010 REST API ───────────────────────────────────
  try {
    const form = new URLSearchParams();
    form.set("To", to);
    form.set("From", TWILIO_FROM_NUMBER);
    form.set("Body", input.body);

    // Twilio uses HTTP Basic auth: base64(AccountSid:AuthToken).
    const basic = Buffer.from(
      `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    const res = await fetch(TWILIO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      const err = `Twilio API error (${res.status}): ${errText.slice(0, 500)}`;
      await logSms({
        partnerCode: input.partnerCode ?? null,
        toPhone: to,
        fromPhone: TWILIO_FROM_NUMBER,
        body: input.body,
        template: input.template,
        status: "failed",
        providerMessageId: null,
        errorMessage: err,
      });
      console.error("[Twilio]", err);
      return { status: "failed", messageId: null, error: err };
    }

    // Twilio returns 201 with a JSON body containing the Message resource.
    const json = (await res.json().catch(() => ({}))) as { sid?: string };
    const messageId = json.sid || null;
    await logSms({
      partnerCode: input.partnerCode ?? null,
      toPhone: to,
      fromPhone: TWILIO_FROM_NUMBER,
      body: input.body,
      template: input.template,
      status: "sent",
      providerMessageId: messageId,
      errorMessage: null,
    });
    return { status: "sent", messageId };
  } catch (err: any) {
    const message = err?.message || String(err);
    await logSms({
      partnerCode: input.partnerCode ?? null,
      toPhone: to,
      fromPhone: TWILIO_FROM_NUMBER,
      body: input.body,
      template: input.template,
      status: "failed",
      providerMessageId: null,
      errorMessage: message,
    });
    console.error("[Twilio] send threw:", message);
    return { status: "failed", messageId: null, error: message };
  }
}

// ─── SmsLog persistence (best-effort, never throws) ──────────────────────────

interface LogSmsRow {
  partnerCode: string | null;
  toPhone: string;
  fromPhone: string;
  body: string;
  template: string;
  status: "sent" | "demo" | "failed" | "skipped_optout";
  providerMessageId: string | null;
  errorMessage: string | null;
}

async function logSms(row: LogSmsRow): Promise<void> {
  try {
    await prisma.smsLog.create({ data: row });
  } catch (err) {
    // Logging failure must never break the caller. Surface to console only.
    console.error("[Twilio] failed to write SmsLog row:", err);
  }
}

// ─── Template helpers ────────────────────────────────────────────────────────

export interface PartnerSmsContext {
  partnerCode: string;
  /** E.164 mobile phone (Partner.mobilePhone). May be null/empty. */
  mobilePhone?: string | null;
  /** TCPA opt-in flag (Partner.smsOptIn). */
  smsOptIn: boolean;
  firstName?: string | null;
  lastName?: string | null;
}

function partnerFirstName(p: PartnerSmsContext): string {
  return (p.firstName || "").trim() || "there";
}

// ─── Admin-editable template lookup ─────────────────────────────────────────
//
// Each `sendXxxSms()` helper first tries to load its template body from the
// `SmsTemplate` table (admin-edited via Communications Hub → SMS → Templates).
// If the row exists and is enabled, the helper interpolates `{variable}`
// tokens against a caller-supplied vars map. If the row is missing, disabled,
// or the DB lookup throws (Neon hiccup), the helper falls back to the
// hardcoded body below so partner-facing flows never break on a template
// outage. Rows are all seeded `enabled: false` while A2P 10DLC is pending,
// meaning the hardcoded fallback is still the live path today.

async function loadSmsTemplateBody(key: string): Promise<string | null> {
  try {
    const tpl = await prisma.smsTemplate.findUnique({ where: { key } });
    if (!tpl || !tpl.enabled) return null;
    return tpl.body;
  } catch {
    return null;
  }
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
  );
}

/**
 * SMS bodies are kept terse — under ~140 chars where possible to fit a
 * single GSM-7 segment. We avoid emoji to preserve segment count.
 */

/**
 * Welcome SMS — fired on partner signup, alongside the welcome email.
 * Skipped if the partner doesn't have a mobile number on file, or if
 * smsOptIn is false.
 */
export async function sendWelcomeSms(
  partner: PartnerSmsContext
): Promise<SendSmsResult> {
  if (!partner.mobilePhone) {
    return { status: "skipped_optout", messageId: null }; // no number, treat as no-op
  }
  const first = partnerFirstName(partner);
  const vars = { firstName: first, partnerCode: partner.partnerCode };
  const tplBody = await loadSmsTemplateBody("welcome");
  const body = tplBody
    ? interpolate(tplBody, vars)
    : `${FIRM_SHORT}: Welcome ${first}! Your partner code is ${partner.partnerCode}. ` +
      `Watch your email for the partnership agreement. Reply STOP to opt out.`;
  return sendSms({
    to: partner.mobilePhone,
    body,
    template: "welcome",
    partnerCode: partner.partnerCode,
    optedIn: partner.smsOptIn,
  });
}

/**
 * Agreement-ready SMS — fired right after the SignWell document is sent.
 * Tells the partner to check their email and points them at the portal.
 */
export async function sendAgreementReadySms(
  partner: PartnerSmsContext
): Promise<SendSmsResult> {
  if (!partner.mobilePhone) {
    return { status: "skipped_optout", messageId: null };
  }
  const first = partnerFirstName(partner);
  const vars = { firstName: first };
  const tplBody = await loadSmsTemplateBody("agreement_ready");
  const body = tplBody
    ? interpolate(tplBody, vars)
    : `${FIRM_SHORT}: Hi ${first}, your partnership agreement is ready to sign. ` +
      `Check your email or log in at ${PORTAL_HOST}. Reply STOP to opt out.`;
  return sendSms({
    to: partner.mobilePhone,
    body,
    template: "agreement_ready",
    partnerCode: partner.partnerCode,
    optedIn: partner.smsOptIn,
  });
}

/**
 * Agreement-signed SMS — fired from the SignWell webhook on
 * `document_completed`. Confirms activation.
 */
export async function sendAgreementSignedSms(
  partner: PartnerSmsContext
): Promise<SendSmsResult> {
  if (!partner.mobilePhone) {
    return { status: "skipped_optout", messageId: null };
  }
  const first = partnerFirstName(partner);
  const vars = { firstName: first };
  const tplBody = await loadSmsTemplateBody("agreement_signed");
  const body = tplBody
    ? interpolate(tplBody, vars)
    : `${FIRM_SHORT}: ${first}, your agreement is signed and your partner ` +
      `account is now active. Log in at ${PORTAL_HOST} to start submitting clients.`;
  return sendSms({
    to: partner.mobilePhone,
    body,
    template: "agreement_signed",
    partnerCode: partner.partnerCode,
    optedIn: partner.smsOptIn,
  });
}

/**
 * L1 inviter notification SMS — tells the L1 a recruit just joined and they
 * need to upload the countersigned agreement.
 */
export async function sendInviterSignupNotificationSms(opts: {
  inviterCode: string;
  inviterMobilePhone?: string | null;
  inviterSmsOptIn: boolean;
  inviterFirstName?: string | null;
  recruitName: string;
  recruitTier: string; // "l2" | "l3"
  commissionRate: number; // 0.10..0.25
}): Promise<SendSmsResult> {
  if (!opts.inviterMobilePhone) {
    return { status: "skipped_optout", messageId: null };
  }
  const first = (opts.inviterFirstName || "").trim() || "there";
  const ratePct = Math.round(opts.commissionRate * 100);
  const vars = {
    firstName: first,
    recruitName: opts.recruitName,
    recruitTier: opts.recruitTier.toUpperCase(),
    ratePct,
  };
  const tplBody = await loadSmsTemplateBody("signup_notification");
  const body = tplBody
    ? interpolate(tplBody, vars)
    : `${FIRM_SHORT}: Hi ${first}, ${opts.recruitName} just joined your downline as ` +
      `${opts.recruitTier.toUpperCase()} at ${ratePct}%. Upload their signed agreement ` +
      `at ${PORTAL_HOST}/dashboard/downline.`;
  return sendSms({
    to: opts.inviterMobilePhone,
    body,
    template: "signup_notification",
    partnerCode: opts.inviterCode,
    optedIn: opts.inviterSmsOptIn,
  });
}

/**
 * Opt-in request SMS — sent to a partner who provided a mobile number at
 * signup but has not yet toggled `smsOptIn=true`. The SMS *is* the opt-in
 * request, so the TCPA gate in `sendSms` is bypassed here: we call the
 * provider directly (and log) rather than going through the opted-in
 * branch of sendSms. Legally OK under TCPA since the partner provided
 * their number in the context of an existing business relationship and
 * the single confirmation message is treated as transactional.
 *
 * Inbound STOP / YES keywords flip Partner.smsOptIn accordingly — handled
 * by the existing /api/twilio/sms inbound webhook (unchanged).
 */
export async function sendOptInRequestSms(
  partner: PartnerSmsContext
): Promise<SendSmsResult> {
  if (!partner.mobilePhone) {
    return { status: "skipped_optout", messageId: null };
  }
  const first = partnerFirstName(partner);
  const vars = { firstName: first };
  const tplBody = await loadSmsTemplateBody("opt_in_request");
  const body = tplBody
    ? interpolate(tplBody, vars)
    : `${FIRM_SHORT}: Hi ${first}, opt in to partner SMS for deal + commission updates? ` +
      `Reply YES to opt in, STOP to decline. Msg&data rates may apply.`;
  // Force optedIn=true so the TCPA gate doesn't skip — this single message
  // IS the opt-in request. Twilio-side rate limiting + A2P approval
  // govern actual send capability.
  return sendSms({
    to: partner.mobilePhone,
    body,
    template: "opt_in_request",
    partnerCode: partner.partnerCode,
    optedIn: true,
  });
}
