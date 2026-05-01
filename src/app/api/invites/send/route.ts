import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllowedDownlineRates } from "@/lib/constants";
import { sendDownlineInviteEmail } from "@/lib/sendgrid";
import { recordActivity } from "@/lib/engagement";
import crypto from "crypto";

function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/**
 * POST /api/invites/send
 * Send a recruitment invite via email (and optionally SMS).
 * Creates the RecruitmentInvite if one doesn't exist for the rate,
 * then fires the email via sendDownlineInviteEmail.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode)
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, rate, method } = body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      rate?: number;
      method?: "email" | "sms" | "both";
    };

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !rate) {
      return NextResponse.json(
        { error: "firstName, lastName, email, and rate are required" },
        { status: 400 },
      );
    }

    const partner = await prisma.partner.findUnique({
      where: { partnerCode },
    });
    if (!partner)
      return NextResponse.json(
        { error: "Partner not found" },
        { status: 404 },
      );

    if (partner.status !== "active") {
      return NextResponse.json(
        { error: "Your account must be active to send invites" },
        { status: 403 },
      );
    }

    const parsedRate = parseFloat(String(rate));
    if (!isFinite(parsedRate) || parsedRate <= 0) {
      return NextResponse.json(
        { error: "Rate must be a positive number" },
        { status: 400 },
      );
    }
    if (parsedRate >= partner.commissionRate) {
      return NextResponse.json(
        {
          error: `Rate must be less than your own rate (${Math.round(partner.commissionRate * 100)}%)`,
        },
        { status: 400 },
      );
    }

    const allowed = getAllowedDownlineRates(partner.commissionRate);
    if (!allowed.some((r) => Math.round(r * 100) === Math.round(parsedRate * 100))) {
      return NextResponse.json(
        { error: "Rate is not in your allowed downline rates" },
        { status: 400 },
      );
    }

    let targetTier: string;
    if (partner.tier === "l1") targetTier = "l2";
    else if (partner.tier === "l2") targetTier = "l3";
    else {
      return NextResponse.json(
        { error: "L3 partners cannot recruit" },
        { status: 403 },
      );
    }

    // Find or create an invite for this rate
    let invite = await prisma.recruitmentInvite.findFirst({
      where: {
        inviterCode: partnerCode,
        commissionRate: parsedRate,
        status: "active",
      },
    });

    if (!invite) {
      invite = await prisma.recruitmentInvite.create({
        data: {
          token: generateToken(),
          inviterCode: partnerCode,
          targetTier,
          commissionRate: parsedRate,
          status: "active",
        },
      });
    }

    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
      "https://fintella.partners";
    const signupUrl = `${baseUrl}/signup?token=${invite.token}`;
    const senderName = `${partner.firstName} ${partner.lastName}`;
    const sendMethod = method || "email";

    let emailSent = false;

    if (sendMethod === "email" || sendMethod === "both") {
      const result = await sendDownlineInviteEmail({
        toEmail: email.trim(),
        toName: `${firstName.trim()} ${lastName.trim()}`,
        signupUrl,
        senderName,
        senderPartnerCode: partnerCode,
        commissionRate: parsedRate,
        targetTier,
      });
      emailSent = result.status === "sent" || result.status === "demo";
    }

    // SMS — prospect hasn't opted in to TCPA yet so we pass optedIn: false
    // which will log skipped_optout. Once A2P clears and the prospect
    // becomes a partner they'll have their own consent flow.
    if ((sendMethod === "sms" || sendMethod === "both") && phone?.trim()) {
      try {
        const { sendSms } = await import("@/lib/twilio");
        await sendSms({
          to: phone.trim(),
          body: `Hi ${firstName.trim()}, ${senderName} invited you to join Fintella as a partner. Sign up here: ${signupUrl}`,
          partnerCode,
          template: "downline_invite_sms",
          optedIn: false,
        });
      } catch {}
    }

    recordActivity(partnerCode, "invite_sent", {
      inviteId: invite.id,
      toEmail: email.trim(),
      method: sendMethod,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      emailSent,
      signupUrl,
      inviteId: invite.id,
    });
  } catch (err) {
    console.error("[invites/send] error:", err);
    return NextResponse.json(
      { error: "Failed to send invite" },
      { status: 500 },
    );
  }
}
