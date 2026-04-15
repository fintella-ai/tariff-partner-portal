/**
 * Twilio Voice Client (Phase 15c)
 *
 * Initiates outbound voice calls via the Twilio v2010 REST API. Mirrors
 * the demo-mode and house pattern from src/lib/twilio.ts (SMS) and
 * src/lib/sendgrid.ts (email): raw fetch() against the Twilio REST API
 * with HTTP Basic auth, no `twilio` npm package, demo-mode fallback when
 * env vars are unset.
 *
 * Click-to-call flow used here:
 *   1. Admin clicks "Call Partner" on /admin/partners/[id]
 *   2. Frontend POSTs to /api/twilio/call with { partnerCode }
 *   3. The API creates a CallLog row (status="initiated"), then calls
 *      initiateBridgedCall() below
 *   4. Twilio dials the configured TWILIO_ADMIN_PHONE first
 *   5. When the admin picks up, Twilio fetches our /api/twilio/voice-webhook
 *      endpoint, which returns TwiML <Dial> bridging to the partner's mobile
 *   6. Twilio fires status callbacks to /api/twilio/call-status as the
 *      call progresses (ringing → in-progress → completed) — those
 *      handlers update the CallLog row in place
 *
 * Recording is intentionally NOT enabled in this initial cut. Two-party
 * call recording carries state-by-state legal disclosure requirements
 * (CA / WA / FL / IL / etc. require all-party consent). Adding recording
 * is a Phase 15c-followup that will require a recorded consent prompt
 * + per-state config.
 */

import { prisma } from "@/lib/prisma";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_ADMIN_PHONE = process.env.TWILIO_ADMIN_PHONE || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";
const TWILIO_VOICE_API_URL = TWILIO_ACCOUNT_SID
  ? `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`
  : "";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

export function isTwilioVoiceConfigured(): boolean {
  return !!(
    TWILIO_ACCOUNT_SID &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_FROM_NUMBER &&
    TWILIO_ADMIN_PHONE
  );
}

export interface InitiateCallInput {
  /** E.164 destination (partner's mobile). */
  to: string;
  /** Partner code for CallLog attribution. Nullable for non-partner calls. */
  partnerCode?: string | null;
  /** Admin user info for the audit trail. */
  initiatedByEmail?: string | null;
  initiatedByName?: string | null;
  /** US state abbreviation from PartnerProfile.state — used to determine
   *  whether all-party consent disclosure is required before recording. */
  partnerState?: string | null;
}

export interface InitiateCallResult {
  callLogId: string;
  status: "initiated" | "demo" | "failed";
  callSid: string | null;
  error?: string;
}

/**
 * Validate E.164. Same rule used by sendSms() in twilio.ts.
 */
function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

/**
 * Initiate a bridged outbound call and persist the result to CallLog.
 *
 * Always resolves — never throws. Failures are persisted to CallLog with
 * status="failed" and returned to the caller without disrupting the API
 * response flow.
 */
export async function initiateBridgedCall(
  input: InitiateCallInput
): Promise<InitiateCallResult> {
  const to = (input.to || "").trim();

  // ── Validate destination ──────────────────────────────────────────────────
  if (!to || !isValidE164(to)) {
    const err = `Invalid destination phone number: ${to || "(empty)"}`;
    const logRow = await createCallLogRow({
      partnerCode: input.partnerCode ?? null,
      toPhone: to,
      fromPhone: TWILIO_FROM_NUMBER,
      initiatedByEmail: input.initiatedByEmail ?? null,
      initiatedByName: input.initiatedByName ?? null,
      status: "failed",
      providerCallSid: null,
      errorMessage: err,
    });
    return { callLogId: logRow.id, status: "failed", callSid: null, error: err };
  }

  // ── Demo mode: no Twilio creds, log + short-circuit ───────────────────────
  if (!isTwilioVoiceConfigured()) {
    const logRow = await createCallLogRow({
      partnerCode: input.partnerCode ?? null,
      toPhone: to,
      fromPhone: TWILIO_FROM_NUMBER || "(demo)",
      initiatedByEmail: input.initiatedByEmail ?? null,
      initiatedByName: input.initiatedByName ?? null,
      status: "demo",
      providerCallSid: null,
      errorMessage: null,
    });
    return { callLogId: logRow.id, status: "demo", callSid: null };
  }

  // ── Real call via Twilio Calls API ────────────────────────────────────────
  // We dial TWILIO_ADMIN_PHONE first; when admin answers Twilio fetches
  // our voice-webhook to get the TwiML that <Dial>s the partner.
  const logRow = await createCallLogRow({
    partnerCode: input.partnerCode ?? null,
    toPhone: to,
    fromPhone: TWILIO_FROM_NUMBER,
    initiatedByEmail: input.initiatedByEmail ?? null,
    initiatedByName: input.initiatedByName ?? null,
    status: "initiated",
    providerCallSid: null,
    errorMessage: null,
  });

  try {
    // The voice-webhook URL is what Twilio hits when admin answers. We pass
    // the partner phone + log id as query params so the webhook knows who
    // to bridge to and which CallLog row to update.
    const stateParam = input.partnerState
      ? `&state=${encodeURIComponent(input.partnerState)}`
      : "";
    const voiceWebhookUrl = `${PORTAL_URL}/api/twilio/voice-webhook?to=${encodeURIComponent(to)}&logId=${encodeURIComponent(logRow.id)}${stateParam}`;
    const statusCallbackUrl = `${PORTAL_URL}/api/twilio/call-status?logId=${encodeURIComponent(logRow.id)}`;

    const form = new URLSearchParams();
    form.set("To", TWILIO_ADMIN_PHONE);
    form.set("From", TWILIO_FROM_NUMBER);
    form.set("Url", voiceWebhookUrl);
    form.set("StatusCallback", statusCallbackUrl);
    form.set("StatusCallbackMethod", "POST");
    // Status events Twilio will POST to our callback. "completed" is the
    // critical one — it carries the final duration.
    form.append("StatusCallbackEvent", "initiated");
    form.append("StatusCallbackEvent", "ringing");
    form.append("StatusCallbackEvent", "answered");
    form.append("StatusCallbackEvent", "completed");

    const basic = Buffer.from(
      `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    const res = await fetch(TWILIO_VOICE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      const err = `Twilio Voice API error (${res.status}): ${errText.slice(0, 500)}`;
      await prisma.callLog
        .update({
          where: { id: logRow.id },
          data: { status: "failed", errorMessage: err },
        })
        .catch(() => {});
      console.error("[TwilioVoice]", err);
      return { callLogId: logRow.id, status: "failed", callSid: null, error: err };
    }

    const json = (await res.json().catch(() => ({}))) as { sid?: string };
    const callSid = json.sid || null;
    await prisma.callLog
      .update({
        where: { id: logRow.id },
        data: { providerCallSid: callSid },
      })
      .catch(() => {});

    return { callLogId: logRow.id, status: "initiated", callSid };
  } catch (err: any) {
    const message = err?.message || String(err);
    await prisma.callLog
      .update({
        where: { id: logRow.id },
        data: { status: "failed", errorMessage: message },
      })
      .catch(() => {});
    console.error("[TwilioVoice] initiate threw:", message);
    return { callLogId: logRow.id, status: "failed", callSid: null, error: message };
  }
}

// ─── CallLog persistence helpers ─────────────────────────────────────────────

interface CreateCallLogRowInput {
  partnerCode: string | null;
  toPhone: string;
  fromPhone: string;
  initiatedByEmail: string | null;
  initiatedByName: string | null;
  status: "initiated" | "demo" | "failed";
  providerCallSid: string | null;
  errorMessage: string | null;
}

async function createCallLogRow(input: CreateCallLogRowInput) {
  return prisma.callLog.create({
    data: {
      partnerCode: input.partnerCode,
      direction: "outbound",
      toPhone: input.toPhone,
      fromPhone: input.fromPhone,
      initiatedByEmail: input.initiatedByEmail,
      initiatedByName: input.initiatedByName,
      status: input.status,
      providerCallSid: input.providerCallSid,
      errorMessage: input.errorMessage,
    },
  });
}

/**
 * Map a Twilio CallStatus value (from the status callback webhook) to the
 * status string we persist in CallLog. Twilio uses kebab-case; we keep
 * those values verbatim so the admin UI can render them directly.
 *
 * https://www.twilio.com/docs/voice/api/call-resource#call-status-values
 */
export function normalizeTwilioCallStatus(twilioStatus: string): string {
  const valid = new Set([
    "queued",
    "initiated",
    "ringing",
    "in-progress",
    "completed",
    "busy",
    "failed",
    "no-answer",
    "canceled",
  ]);
  return valid.has(twilioStatus) ? twilioStatus : "initiated";
}
