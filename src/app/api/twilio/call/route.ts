import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { initiateBridgedCall, isTwilioVoiceConfigured } from "@/lib/twilio-voice";

/**
 * POST /api/twilio/call
 *
 * Admin-only endpoint that initiates a bridged outbound voice call to a
 * partner via Twilio. Body: { partnerCode: string }
 *
 * The call is dialed from TWILIO_FROM_NUMBER to the configured
 * TWILIO_ADMIN_PHONE first; when admin answers Twilio bridges to the
 * partner's mobile via /api/twilio/voice-webhook. Status updates from
 * Twilio land in CallLog via /api/twilio/call-status.
 *
 * Demo mode (Twilio not configured): writes a CallLog row with
 * status="demo" and returns success. Useful for local dev + the
 * Communication Log demo.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { partnerCode } = body || {};

    if (!partnerCode || typeof partnerCode !== "string") {
      return NextResponse.json(
        { error: "partnerCode is required" },
        { status: 400 }
      );
    }

    const partner = await prisma.partner.findUnique({
      where: { partnerCode },
      select: { partnerCode: true, mobilePhone: true, firstName: true, lastName: true },
    });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    if (!partner.mobilePhone) {
      return NextResponse.json(
        { error: "Partner has no mobile phone on file" },
        { status: 400 }
      );
    }

    // Fetch state from PartnerProfile for consent determination.
    // PartnerProfile shares partnerCode but has no Prisma relation on Partner.
    const profile = await prisma.partnerProfile
      .findUnique({ where: { partnerCode }, select: { state: true } })
      .catch(() => null);

    const result = await initiateBridgedCall({
      to: partner.mobilePhone,
      partnerCode: partner.partnerCode,
      initiatedByEmail: (session.user as any).email || null,
      initiatedByName: (session.user as any).name || null,
      partnerState: profile?.state ?? null,
    });

    return NextResponse.json({
      callLogId: result.callLogId,
      status: result.status,
      callSid: result.callSid,
      configured: isTwilioVoiceConfigured(),
      error: result.error,
    });
  } catch (err: any) {
    console.error("[/api/twilio/call] error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to initiate call" },
      { status: 500 }
    );
  }
}
