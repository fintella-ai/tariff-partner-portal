import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";
import { sendForSigning, buildPartnerTemplateFields } from "@/lib/signwell";
import { hashSync } from "bcryptjs";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";

function generatePartnerCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PTN";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * GET /api/getstarted?token=XXX
 * Validate an admin-generated L1 invite token before showing the signup form.
 * Returns invite metadata (email, name) so the form can pre-fill.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "No invite token provided" }, { status: 400 });

  const invite = await prisma.recruitmentInvite.findUnique({ where: { token } });
  if (!invite || invite.targetTier !== "l1") {
    return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
  }
  if (invite.status !== "active") {
    return NextResponse.json({ error: "This invite link has already been used" }, { status: 410 });
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
  }

  return NextResponse.json({
    invite: {
      invitedEmail: invite.invitedEmail,
      invitedName: invite.invitedName,
      commissionRate: invite.commissionRate,
    },
  });
}

/**
 * POST /api/getstarted
 * Admin-invited L1 partner signup. Requires a valid invite token.
 * Creates partner + sends 25% SignWell agreement.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, firstName, lastName, email, phone, mobilePhone, companyName, password, emailOptIn, smsOptIn } = body;

    // Validate invite token
    if (!token) {
      return NextResponse.json({ error: "Invite token is required" }, { status: 400 });
    }
    const invite = await prisma.recruitmentInvite.findUnique({ where: { token } });
    if (!invite || invite.targetTier !== "l1") {
      return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    }
    if (invite.status !== "active") {
      return NextResponse.json({ error: "This invite link has already been used" }, { status: 410 });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
    }

    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json({ error: "First name, last name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Check email not already registered
    const existing = await prisma.partner.findFirst({ where: { email } });
    if (existing) return NextResponse.json({ error: "This email is already registered as a partner" }, { status: 400 });

    // Generate unique partner code
    let partnerCode = generatePartnerCode();
    while (await prisma.partner.findUnique({ where: { partnerCode } })) {
      partnerCode = generatePartnerCode();
    }

    // Create L1 partner
    const partner = await prisma.partner.create({
      data: {
        partnerCode,
        email: email.trim(),
        passwordHash: hashSync(password, 10),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyName: companyName?.trim() || null,
        phone: normalizePhone(phone),
        mobilePhone: normalizePhone(mobilePhone),
        status: "pending", // pending until agreement signed
        tier: "l1",
        commissionRate: invite.commissionRate,
        emailOptIn: !!emailOptIn,
        smsOptIn: !!smsOptIn,
        optInDate: (emailOptIn || smsOptIn) ? new Date() : null,
      },
    });

    // Mark invite as used
    await prisma.recruitmentInvite.update({
      where: { id: invite.id },
      data: { status: "used", usedByPartnerCode: partnerCode },
    });

    // Create profile
    await prisma.partnerProfile.create({
      data: { partnerCode },
    }).catch(() => {});

    // Get 25% agreement template
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    const templateId = settings?.agreementTemplate25 || undefined;

    // Send partnership agreement via SignWell
    const partnerName = `${firstName.trim()} ${lastName.trim()}`;
    const templateFields = buildPartnerTemplateFields({
      partnerCode,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      fullName: partnerName,
      email: email.trim(),
      phone: phone?.trim(),
      companyName: companyName?.trim(),
      commissionRate: invite.commissionRate,
    });
    const { documentId, embeddedSigningUrl } = await sendForSigning({
      name: `${FIRM_SHORT} Partnership Agreement — ${partnerName} (25%)`,
      subject: `${FIRM_SHORT} Partnership Agreement`,
      message: `Hi ${partnerName}, please review and sign your ${FIRM_NAME} partnership agreement.`,
      recipients: [{ id: partnerCode, email: email.trim(), name: partnerName, role: "Partner" }],
      templateId,
      templateFields,
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

    return NextResponse.json({
      success: true,
      partnerCode,
      embeddedSigningUrl: embeddedSigningUrl || null,
      message: `Account created! Please sign your partnership agreement to activate your account.`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("[GetStarted] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create account" }, { status: 500 });
  }
}
