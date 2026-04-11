import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendForSigning, isSignWellConfigured } from "@/lib/signwell";
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
    const { token, firstName, lastName, email, phone, companyName } = body;

    if (!token || !firstName || !lastName || !email) {
      return NextResponse.json({ error: "Token, first name, last name, and email are required" }, { status: 400 });
    }

    // Validate invite
    const invite = await prisma.recruitmentInvite.findUnique({ where: { token } });
    if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    if (invite.status !== "active") return NextResponse.json({ error: "This invite has already been used" }, { status: 400 });

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
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyName: companyName?.trim() || null,
        phone: phone?.trim() || null,
        status: "pending", // pending until agreement signed
        referredByPartnerCode: invite.inviterCode,
        tier: invite.targetTier,
        commissionRate: invite.commissionRate,
        recruitedViaInvite: invite.token,
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

    // Get the correct agreement template based on rate
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    const ratePercent = Math.round(invite.commissionRate * 100);
    let templateId: string | undefined;
    if (settings) {
      if (ratePercent === 25) templateId = settings.agreementTemplate25 || undefined;
      else if (ratePercent === 20) templateId = settings.agreementTemplate20 || undefined;
      else if (ratePercent === 15) templateId = settings.agreementTemplate15 || undefined;
      else if (ratePercent === 10) templateId = settings.agreementTemplate10 || undefined;
    }

    // Send partnership agreement
    const partnerName = `${firstName.trim()} ${lastName.trim()}`;
    const { documentId, embeddedSigningUrl } = await sendForSigning({
      name: `${FIRM_SHORT} Partnership Agreement — ${partnerName} (${ratePercent}%)`,
      subject: `${FIRM_SHORT} Partnership Agreement`,
      message: `Hi ${partnerName}, please review and sign your ${FIRM_NAME} partnership agreement at ${ratePercent}% commission.`,
      recipients: [{ id: partnerCode, email: email.trim(), name: partnerName, role: "Partner" }],
      templateId,
    });

    await prisma.partnershipAgreement.create({
      data: {
        partnerCode,
        version: 1,
        signwellDocumentId: documentId,
        embeddedSigningUrl: embeddedSigningUrl || null,
        templateRate: invite.commissionRate,
        templateId: templateId || null,
        status: "pending",
        sentDate: new Date(),
      },
    });

    // Notify the inviting partner
    await prisma.notification.create({
      data: {
        recipientType: "partner",
        recipientId: invite.inviterCode,
        type: "deal_update",
        title: "New Partner Signed Up!",
        message: `${partnerName} has signed up as your ${invite.targetTier.toUpperCase()} partner at ${ratePercent}% commission. Their agreement has been sent.`,
        link: "/dashboard/downline",
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      partnerCode,
      message: `Account created! Your partnership agreement has been sent to ${email}. Once signed, you can log in with your email and partner code: ${partnerCode}`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("[Signup] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create account" }, { status: 500 });
  }
}
