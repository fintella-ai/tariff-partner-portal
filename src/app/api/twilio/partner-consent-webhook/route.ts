import { NextRequest, NextResponse } from "next/server";
import { ALL_PARTY_CONSENT_STATES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * Twilio Partner Consent Webhook (Phase 15c)
 *
 * Twilio calls this URL on the OUTBOUND leg of a <Dial> (via the <Number url>
 * attribute) before bridging the partner into the call. This lets us play
 * a consent disclosure to the PARTNER (the person being called) — not just
 * to the admin who initiated the call.
 *
 * Why this is needed:
 *   The main voice-webhook plays a <Say> to the admin (first leg) before
 *   <Dial> connects. But the partner (second leg) never hears that. For
 *   all-party consent states (CA, WA, FL, IL, PA, etc.) both parties must
 *   be notified before a call is recorded. This endpoint closes that gap.
 *
 * Query params (set by buildBridgeTwiml):
 *   ?state=CA   — partner's US state abbreviation
 *
 * Response:
 *   - If recording is enabled AND state requires all-party consent:
 *       <Say> disclosure + empty <Response> (Twilio then bridges the call)
 *   - Otherwise: empty <Response> (call bridges immediately, no message)
 *
 * Always returns 200 — Twilio retries non-200 responses.
 */

function twiml(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const state = req.nextUrl.searchParams.get("state") || null;

  // Read recording toggle from DB.
  const settings = await prisma.portalSettings
    .findUnique({ where: { id: "global" }, select: { callRecordingEnabled: true } })
    .catch(() => null);
  const recordingEnabled = settings?.callRecordingEnabled ?? false;

  // Play recording disclosure on ALL recorded calls, not just consent states.
  // Partners should always know the call is recorded.
  if (recordingEnabled) {
    return twiml(
      `<Response><Say voice="Polly.Joanna">This call is being recorded for quality and training purposes.</Say></Response>`
    );
  }

  // Recording disabled — empty response bridges immediately.
  return twiml(`<Response/>`);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
