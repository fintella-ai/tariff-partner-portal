import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { FIRM_SHORT } from "@/lib/constants";
import { fireWorkflowTrigger } from "@/lib/workflow-engine";

/**
 * Twilio Inbound SMS Webhook (Phase 15b-fu #2)
 *
 * Receives inbound SMS events from Twilio when partners reply to our
 * outbound texts. The primary purpose is TCPA compliance: when a partner
 * texts STOP / UNSUBSCRIBE / etc., we must immediately flip
 * `Partner.smsOptIn = false` so the next outbound attempt short-circuits
 * via the gate inside `src/lib/twilio.ts`. Conversely, START / UNSTOP
 * re-enables consent.
 *
 * Twilio's "Advanced Opt-Out" feature handles STOP at the carrier level
 * automatically, but we ALSO handle it at the application level so:
 *  1. Our DB stays in sync with Twilio's opt-out list
 *  2. The admin Communication Log shows the inbound STOP/START
 *  3. Any partner-side opt-in toggle in /dashboard/settings reflects the
 *     true state immediately
 *
 * Twilio POSTs application/x-www-form-urlencoded with these fields:
 *   MessageSid, AccountSid, From, To, Body, NumMedia, FromCity, ...
 *
 * Returns TwiML (XML) per Twilio's webhook contract. An empty
 * <Response/> tells Twilio not to auto-reply; including <Message> sends
 * the auto-reply text to the partner.
 *
 * Signature verification: when TWILIO_AUTH_TOKEN is set, we verify the
 * X-Twilio-Signature header (HMAC-SHA1 of the full URL + sorted form
 * params, base64-encoded, keyed with the auth token). When the token is
 * unset (demo mode) we accept the request unverified so the route can be
 * exercised against local dev / preview deploys without real Twilio
 * credentials.
 */

// Twilio's standard opt-out and opt-in keyword sets. Per
// https://www.twilio.com/docs/messaging/services/advanced-opt-out
// these are case-insensitive and matched against the trimmed message body.
const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);
const START_KEYWORDS = new Set(["START", "UNSTOP", "YES"]);

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";

/**
 * Verify the X-Twilio-Signature header against the request.
 *
 * The signature is HMAC-SHA1 of:
 *   full request URL +
 *   keys of POST body, sorted alphabetically, each followed by its value
 * keyed with the Twilio auth token, base64-encoded.
 *
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!TWILIO_AUTH_TOKEN) return true; // demo mode — skip verification
  if (!signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac("sha1", TWILIO_AUTH_TOKEN)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

function twimlResponse(messageBody?: string): NextResponse {
  const body = messageBody
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(messageBody)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new NextResponse(body, {
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

/**
 * POST /api/twilio/webhook
 *
 * Inbound SMS handler. Always returns 200 with a TwiML body — Twilio
 * retries non-200 responses so we never want to surface server errors
 * back to the carrier. Errors are logged to the SmsLog row + console.
 */
export async function POST(req: NextRequest) {
  try {
    // Twilio sends application/x-www-form-urlencoded. We read the raw text
    // and parse via URLSearchParams so we don't need formData() iterator
    // semantics that depend on the TS lib target.
    const rawBody = await req.text();
    const usp = new URLSearchParams(rawBody);
    const params: Record<string, string> = {};
    usp.forEach((value, key) => {
      params[key] = value;
    });

    // Verify the signature when auth token is configured.
    const signature = req.headers.get("x-twilio-signature");
    // Reconstruct the full URL Twilio used. Behind Vercel's reverse proxy
    // we trust the `host` header and protocol from x-forwarded-proto.
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("host") || "fintella.partners";
    const fullUrl = `${proto}://${host}${req.nextUrl.pathname}`;

    if (!verifyTwilioSignature(fullUrl, params, signature)) {
      console.warn("[TwilioWebhook] signature verification failed");
      // Return 403 so Twilio surfaces it in the dashboard but don't
      // expose details. Production should never see this.
      return new NextResponse("Forbidden", { status: 403 });
    }

    const fromPhone = (params.From || "").trim();
    const toPhone = (params.To || "").trim();
    const body = (params.Body || "").trim();
    const messageSid = params.MessageSid || null;

    if (!fromPhone || !body) {
      return twimlResponse();
    }

    // Match the inbound number to a Partner. mobilePhone is the canonical
    // SMS destination so that's what we look up against.
    const partner = await prisma.partner
      .findFirst({
        where: { mobilePhone: fromPhone },
        select: { partnerCode: true, smsOptIn: true, firstName: true },
      })
      .catch(() => null);

    // Classify the keyword (case-insensitive on the trimmed body).
    const upper = body.toUpperCase();
    const isStop = STOP_KEYWORDS.has(upper);
    const isStart = START_KEYWORDS.has(upper);
    const template = isStop
      ? "stop_keyword"
      : isStart
      ? "start_keyword"
      : "inbound_other";

    // Log the inbound message regardless of partner match. Unmatched
    // numbers still get a row (partnerCode = null) so we can debug.
    await prisma.smsLog
      .create({
        data: {
          partnerCode: partner?.partnerCode ?? null,
          direction: "inbound",
          toPhone,
          fromPhone,
          body,
          template,
          status: "received",
          providerMessageId: messageSid,
          errorMessage: null,
        },
      })
      .catch((err) =>
        console.error("[TwilioWebhook] failed to log inbound SMS:", err)
      );

    // If the inbound matches a STOP/START keyword AND we have a partner
    // record, flip the consent flag.
    if (partner && (isStop || isStart)) {
      const newOptIn = isStart;
      // Only refresh optInDate when consent flips to true (matches the
      // pattern in PATCH /api/partner/settings).
      const flippedOn = isStart && !partner.smsOptIn;

      await prisma.partner
        .update({
          where: { partnerCode: partner.partnerCode },
          data: {
            smsOptIn: newOptIn,
            ...(flippedOn && { optInDate: new Date() }),
          },
        })
        .catch((err) =>
          console.error(
            "[TwilioWebhook] failed to update partner.smsOptIn:",
            err
          )
        );

      // Fire opt-in/opt-out workflow triggers — fire-and-forget.
      fireWorkflowTrigger(isStart ? "sms.opt_in" : "sms.opt_out", {
        partner: {
          partnerCode: partner.partnerCode,
          firstName: partner.firstName,
          mobilePhone: fromPhone,
        },
      }).catch(() => {});
    }

    // Fire sms.received for non-keyword inbound messages so admins can
    // build automations that ping a Slack channel, open a support ticket,
    // etc. STOP/START are handled by sms.opt_in / sms.opt_out above.
    if (!isStop && !isStart) {
      fireWorkflowTrigger("sms.received", {
        sms: {
          partnerCode: partner?.partnerCode ?? null,
          fromPhone,
          toPhone,
          body,
        },
      }).catch(() => {});
    }

    // Auto-reply only for STOP/START so the partner gets immediate
    // confirmation. For unknown bodies, return an empty <Response/> and
    // let admins follow up via support if needed.
    if (isStop) {
      return twimlResponse(
        `${FIRM_SHORT}: You've been unsubscribed from text messages. Reply START to opt back in. No further messages will be sent.`
      );
    }
    if (isStart) {
      return twimlResponse(
        `${FIRM_SHORT}: You're back in. We'll send transactional updates here. Reply STOP at any time to opt out.`
      );
    }
    return twimlResponse();
  } catch (err: any) {
    console.error("[TwilioWebhook] handler threw:", err);
    // Still return 200 so Twilio doesn't retry the same broken request.
    return twimlResponse();
  }
}

// Twilio sends GET requests to verify webhook reachability when admins
// configure the URL in the Twilio console. Respond with a tiny TwiML
// shell so the test passes without any side effects.
export async function GET() {
  return twimlResponse();
}
