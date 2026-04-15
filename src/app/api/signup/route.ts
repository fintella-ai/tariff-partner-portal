import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendWelcomeEmail,
  sendInviterSignupNotificationEmail,
} from "@/lib/sendgrid";
import {
  sendWelcomeSms,
  sendInviterSignupNotificationSms,
} from "@/lib/twilio";
import { hashSync } from "bcryptjs";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";

function generatePartnerCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PTN";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * GET /api/signup?token=ABC123
 * Validates an invite token and returns invite details (public, no auth).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

  try {
    const invite = await prisma.recruitmentInvite.findUnique({ where: { token } });
    if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    if (invite.status !== "active") return NextResponse.json({ error: "This invite link has already been used or expired" }, { status: 400 });
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      await prisma.recruitmentInvite.update({ where: { token }, data: { status: "expired" } });
      return NextResponse.json({ error: "This invite link has expired" }, { status: 400 });
    }

    // L1 invites go through /api/getstarted, not here
    if (invite.targetTier === "l1" || !invite.inviterCode) {
      return NextResponse.json({ error: "Invalid invite type for this endpoint" }, { status: 400 });
    }

    // Get inviter info
    const inviter = await prisma.partner.findUnique({
      where: { partnerCode: invite.inviterCode },
      select: { firstName: true, lastName: true, companyName: true, partnerCode: true },
    });

    return NextResponse.json({
      invite: {
        targetTier: invite.targetTier,
        commissionRate: invite.commissionRate,
        inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "Partner",
        inviterCompany: inviter?.companyName || null,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to validate invite" }, { status: 500 });
  }
}

/**
 * POST /api/signup
 * Public partner signup. Creates partner, sends agreement.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, firstName, lastName, email, phone, mobilePhone, companyName, password, emailOptIn, smsOptIn } = body;

    if (!token || !firstName || !lastName || !email || !password) {
      return NextResponse.json({ error: "Token, first name, last name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Validate invite
    const invite = await prisma.recruitmentInvite.findUnique({ where: { token } });
    if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    if (invite.status !== "active") return NextResponse.json({ error: "This invite has already been used" }, { status: 400 });
    // L1 invites go through /api/getstarted, not here
    if (invite.targetTier === "l1" || !invite.inviterCode) {
      return NextResponse.json({ error: "Invalid invite type for this endpoint" }, { status: 400 });
    }

    // Check email not already registered
    const existing = await prisma.partner.findFirst({ where: { email } });
    if (existing) return NextResponse.json({ error: "This email is already registered as a partner" }, { status: 400 });

    // Generate partner code
    let partnerCode = generatePartnerCode();
    while (await prisma.partner.findUnique({ where: { partnerCode } })) {
      partnerCode = generatePartnerCode();
    }

    // Create partner
    const partner = await prisma.partner.create({
      data: {
        partnerCode,
        email: email.trim(),
        passwordHash: hashSync(password, 10),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyName: companyName?.trim() || null,
        phone: phone?.trim() || null,
        mobilePhone: mobilePhone?.trim() || null,
        status: "pending", // pending until agreement signed
        referredByPartnerCode: invite.inviterCode,
        tier: invite.targetTier,
        commissionRate: invite.commissionRate,
        recruitedViaInvite: invite.token,
        emailOptIn: !!emailOptIn,
        smsOptIn: !!smsOptIn,
        optInDate: (emailOptIn || smsOptIn) ? new Date() : null,
      },
    });

    // Create profile
    await prisma.partnerProfile.create({
      data: { partnerCode },
    }).catch(() => {}); // ignore if already exists

    // Mark invite as used
    await prisma.recruitmentInvite.update({
      where: { token },
      data: { status: "used", usedByPartnerCode: partnerCode },
    });

    const partnerName = `${firstName.trim()} ${lastName.trim()}`;
    const ratePercent = Math.round(invite.commissionRate * 100);

    // L2/L3 partners do NOT receive SignWell agreements.
    // Their L1 upline is responsible for uploading a signed agreement.
    // Partner stays "pending" until L1 uploads and admin approves.

    // Notify the inviting partner (L1) about the new signup
    await prisma.notification.create({
      data: {
        recipientType: "partner",
        recipientId: invite.inviterCode!, // non-null guard: checked above
        type: "deal_update",
        title: "New Partner Signed Up!",
        message: `${partnerName} has signed up as your ${invite.targetTier.toUpperCase()} partner at ${ratePercent}% commission. Please upload their signed partnership agreement from your Downline page.`,
        link: "/dashboard/downline",
      },
    }).catch(() => {});

    // Phase 15a/15b — transactional emails + SMS. Awaited so Vercel doesn't
    // kill the function before the network calls complete. Run in parallel
    // where possible; failures are non-fatal (logged internally by each helper).
    const inviter = await prisma.partner.findUnique({
      where: { partnerCode: invite.inviterCode! }, // non-null guard: checked above
      select: {
        email: true,
        firstName: true,
        lastName: true,
        partnerCode: true,
        mobilePhone: true,
        smsOptIn: true,
      },
    }).catch(() => null);

    const inviterName =
      inviter ? ([inviter.firstName, inviter.lastName].filter(Boolean).join(" ").trim() || "Partner") : null;

    await Promise.all([
      // 1) Welcome email + SMS to the new partner
      sendWelcomeEmail({
        partnerCode,
        email: partner.email,
        firstName: partner.firstName,
        lastName: partner.lastName,
      }).catch((err) => console.error("[Signup] welcome email failed:", err)),

      sendWelcomeSms({
        partnerCode,
        mobilePhone: partner.mobilePhone,
        smsOptIn: partner.smsOptIn,
        firstName: partner.firstName,
        lastName: partner.lastName,
      }).catch((err) => console.error("[Signup] welcome SMS failed:", err)),

      // 2) Notification email + SMS to the inviting L1 partner
      inviter?.email
        ? sendInviterSignupNotificationEmail({
            inviterEmail: inviter.email,
            inviterName: inviterName!,
            inviterCode: inviter.partnerCode,
            recruitName: partnerName,
            recruitTier: invite.targetTier,
            commissionRate: invite.commissionRate,
          }).catch((err) => console.error("[Signup] inviter notification email failed:", err))
        : Promise.resolve(),

      inviter
        ? sendInviterSignupNotificationSms({
            inviterCode: inviter.partnerCode,
            inviterMobilePhone: inviter.mobilePhone,
            inviterSmsOptIn: inviter.smsOptIn,
            inviterFirstName: inviter.firstName,
            recruitName: partnerName,
            recruitTier: invite.targetTier,
            commissionRate: invite.commissionRate,
          }).catch((err) => console.error("[Signup] inviter notification SMS failed:", err))
        : Promise.resolve(),
    ]);

    return NextResponse.json({
      success: true,
      partnerCode,
      message: `Account created! Your upline partner will submit your partnership agreement. Once approved, you can log in and start submitting deals.`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("[Signup] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create account" }, { status: 500 });
  }
}
