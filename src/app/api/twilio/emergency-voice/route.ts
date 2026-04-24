import { NextRequest } from "next/server";

/**
 * POST/GET /api/twilio/emergency-voice
 *
 * TwiML webhook Twilio hits when the outbound emergency call connects.
 * Returns XML that plays a short TTS message: identifies the alert source
 * + reason + invites the admin to press 1 to acknowledge.
 *
 * Twilio fetches this URL per `initiateBridgedCall`/`outboundEmergencyDial`
 * configuration. It accepts either POST (Twilio default) or GET for easier
 * manual testing.
 *
 * Query params:
 *   reason=<url-encoded summary>
 *   test=1  (prefixes the spoken message with "Test alert —")
 */
async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reasonRaw = searchParams.get("reason") || "a portal issue";
  const reason = decodeURIComponent(reasonRaw).slice(0, 500);
  const isTest = searchParams.get("test") === "1";

  const prefix = isTest
    ? "This is a test alert from Fintella Partner Portal. "
    : "Urgent alert from Fintella Partner Portal. ";
  const spoken = `${prefix}${escapeXml(reason)}. Press 1 to acknowledge.`;

  // Basic TwiML: <Say> the alert, <Gather> a single digit to acknowledge.
  // If the admin hangs up without pressing 1, Twilio marks the call
  // completed — the status callback picks that up.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${spoken}</Say>
  <Gather input="dtmf" numDigits="1" timeout="8">
    <Say voice="alice">Press 1 to acknowledge.</Say>
  </Gather>
  <Say voice="alice">No acknowledgement received. The alert is still active in the portal. Goodbye.</Say>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

/** XML-escape a string for safe inclusion inside <Say>. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
