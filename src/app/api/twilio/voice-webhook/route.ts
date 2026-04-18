import { NextRequest, NextResponse } from "next/server";
import { FIRM_SHORT, ALL_PARTY_CONSENT_STATES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

/**
 * Twilio Voice Webhook (Phase 15c)
 *
 * Twilio fetches this URL when the admin (TWILIO_ADMIN_PHONE) answers
 * the bridged call started by initiateBridgedCall(). Twilio expects a
 * TwiML response telling it what to do next.
 *
 * We respond with a brief Say + Dial:
 *  - Speak a short connection prompt to the admin
 *  - <Dial> the partner's mobile (passed as ?to= query param)
 *
 * The partner phone is sent as a query string param (set by
 * initiateBridgedCall) so this route is stateless and Twilio just needs
 * to GET/POST the URL we already constructed.
 *
 * Twilio will POST or GET this URL. Per Twilio docs we should accept
 * both; we wrap the same handler.
 *
 * Signature verification: Twilio also signs voice webhooks. For now we
 * trust the request because (a) the URL is unguessable (it carries a
 * specific CallLog id), (b) the bridge target is also passed as a query
 * param so even an attacker who guessed the URL couldn't do anything
 * besides re-bridge to themselves, and (c) the Twilio account auth
 * token is still required to *originate* the call. A future hardening
 * pass can add HMAC verification matching the SMS webhook.
 */

function twiml(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildBridgeTwiml(
  toPhone: string,
  state: string | null,
  logId: string | null,
  recordingEnabled: boolean
): string {
  // Brief Say + Dial. The Say uses Twilio's polly voice for clearer
  // English than the legacy "alice" voice. callerId defaults to whatever
  // From was set on the original call (TWILIO_FROM_NUMBER) — we don't
  // override it here so caller ID stays consistent.
  const safeNumber = escapeXml(toPhone);

  // All-party consent disclosure: played to the admin before bridging when
  // recording is enabled and the partner's state requires it.
  const needsConsent =
    recordingEnabled && !!state && ALL_PARTY_CONSENT_STATES.has(state);
  const consentSay = needsConsent
    ? `\n  <Say voice="Polly.Joanna">This call may be recorded for quality and compliance purposes. By continuing, all parties consent to this recording.</Say>`
    : "";

  // Recording attributes on <Dial>: dual-channel captures admin + partner
  // separately. recordingStatusCallback fires when Twilio finishes
  // processing the recording (after the call ends).
  let recordingAttrs = "";
  if (recordingEnabled) {
    const cbBase = `${PORTAL_URL}/api/twilio/recording-webhook`;
    const cbUrl = logId
      ? `${cbBase}?logId=${encodeURIComponent(logId)}`
      : cbBase;
    recordingAttrs =
      ` record="record-from-answer-dual"` +
      ` recordingStatusCallback="${escapeXml(cbUrl)}"` +
      ` recordingStatusCallbackMethod="POST"`;
  }

  // When recording is enabled, use <Number url="..."> so Twilio plays
  // the partner-consent-webhook TwiML to the PARTNER (outbound leg) before
  // bridging. This ensures the called party also hears the consent
  // disclosure — required for all-party consent states (CA, WA, FL, etc.)
  // and best practice everywhere. Without this, only the admin hears it.
  let dialContent: string;
  if (recordingEnabled) {
    const consentUrl = `${PORTAL_URL}/api/twilio/partner-consent-webhook${state ? `?state=${encodeURIComponent(state)}` : ""}`;
    dialContent = `<Number url="${escapeXml(consentUrl)}">${safeNumber}</Number>`;
  } else {
    dialContent = safeNumber;
  }

  return `<Response>${consentSay}
  <Say voice="Polly.Joanna">Connecting you to your ${escapeXml(FIRM_SHORT)} partner now.</Say>
  <Dial timeout="25" answerOnBridge="true"${recordingAttrs}>${dialContent}</Dial>
</Response>`;
}

function buildSoftphoneOutboundTwiml(
  toPhone: string,
  recordingEnabled: boolean,
  logId?: string | null
): string {
  // Browser softphone → partner dial. The admin is already connected
  // over WebRTC when this runs, so we only need to <Dial> the partner's
  // number. callerId is set explicitly to TWILIO_FROM_NUMBER so the
  // partner sees Fintella's verified number, not the softphone identity.
  const callerId = process.env.TWILIO_FROM_NUMBER || "";
  const safeNumber = escapeXml(toPhone);
  const callerAttr = callerId ? ` callerId="${escapeXml(callerId)}"` : "";

  // Recording for softphone: pass logId so recording webhook can match
  let recordingAttrs = "";
  if (recordingEnabled) {
    const cbBase = `${PORTAL_URL}/api/twilio/recording-webhook`;
    const cbUrl = logId ? `${cbBase}?logId=${encodeURIComponent(logId)}` : cbBase;
    recordingAttrs =
      ` record="record-from-answer-dual"` +
      ` recordingStatusCallback="${escapeXml(cbUrl)}"` +
      ` recordingStatusCallbackMethod="POST"`;
  }

  // When recording, use <Number url="..."> to play consent disclosure to
  // the partner before bridging, same as the bridged call path.
  let dialContent: string;
  if (recordingEnabled) {
    const consentUrl = `${PORTAL_URL}/api/twilio/partner-consent-webhook`;
    dialContent = `<Number url="${escapeXml(consentUrl)}">${safeNumber}</Number>`;
  } else {
    dialContent = safeNumber;
  }

  // Status callback so softphone calls get status updates (ringing→completed)
  let statusAttrs = "";
  if (logId) {
    const statusUrl = `${PORTAL_URL}/api/twilio/call-status?logId=${encodeURIComponent(logId)}`;
    statusAttrs = ` action="${escapeXml(statusUrl)}"`;
  }

  return `<Response>
  <Dial${callerAttr} timeout="25" answerOnBridge="true"${recordingAttrs}${statusAttrs}>${dialContent}</Dial>
</Response>`;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  // Read recording toggle from DB — single fast lookup on the settings singleton.
  const settings = await prisma.portalSettings
    .findUnique({ where: { id: "global" }, select: { callRecordingEnabled: true } })
    .catch(() => null);
  const recordingEnabled = settings?.callRecordingEnabled ?? false;

  // Bridged-call path: ?to=, ?logId=, ?state= set by initiateBridgedCall().
  const toQuery = req.nextUrl.searchParams.get("to") || "";
  if (toQuery) {
    if (!/^\+[1-9]\d{6,14}$/.test(toQuery)) {
      return twiml(
        `<Response><Say voice="Polly.Joanna">Invalid destination number. Goodbye.</Say><Hangup/></Response>`
      );
    }
    const logId = req.nextUrl.searchParams.get("logId") || null;
    const state = req.nextUrl.searchParams.get("state") || null;
    return twiml(buildBridgeTwiml(toQuery, state, logId, recordingEnabled));
  }

  // Softphone outbound path: TwiML App POSTs form-encoded body with
  // a "To" field that the browser Device.connect() populated via params.
  if (req.method === "POST") {
    try {
      const form = await req.formData();
      const toForm = String(form.get("To") || "");
      const softphoneLogId = String(form.get("logId") || "");
      if (toForm && /^\+[1-9]\d{6,14}$/.test(toForm)) {
        // Update CallLog with the CallSid from this Twilio leg
        const callSid = String(form.get("CallSid") || "");
        if (softphoneLogId && callSid) {
          prisma.callLog.update({
            where: { id: softphoneLogId },
            data: { providerCallSid: callSid, status: "ringing" },
          }).catch(() => {});
        }
        return twiml(buildSoftphoneOutboundTwiml(toForm, recordingEnabled, softphoneLogId || null));
      }
    } catch {
      // fall through to error
    }
  }

  return twiml(
    `<Response><Say voice="Polly.Joanna">No destination provided. Goodbye.</Say><Hangup/></Response>`
  );
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
