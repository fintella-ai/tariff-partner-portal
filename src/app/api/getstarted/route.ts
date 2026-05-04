import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";
import { sendForSigning, buildPartnerTemplateFields } from "@/lib/signwell";
import { hashSync } from "bcryptjs";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";

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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkAuthRateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.retryAfterMs || 60000) / 1000)) } }
    );
  }

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Check email not already registered — if pending, return their existing signing URL
    const existing = await prisma.partner.findFirst({ where: { email } });
    if (existing) {
      if (existing.status === "pending") {
        const agreement = await prisma.partnershipAgreement.findFirst({
          where: { partnerCode: existing.partnerCode },
          orderBy: { version: "desc" },
          select: { embeddedSigningUrl: true, status: true },
        });
        return NextResponse.json({
          success: true,
          partnerCode: existing.partnerCode,
          embeddedSigningUrl: agreement?.embeddedSigningUrl || null,
          message: "Your account already exists. Please sign your partnership agreement to activate.",
          alreadyExists: true,
        }, { status: 200 });
      }
      return NextResponse.json({ error: "This email is already registered as a partner. Please log in instead." }, { status: 400 });
    }

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

    // Get agreement template for this rate
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });

    if (settings?.haltAgreementSending) {
      await prisma.partnershipAgreement.create({
        data: {
          partnerCode,
          version: 1,
          signwellDocumentId: null,
          embeddedSigningUrl: null,
          cosignerSigningUrl: null,
          templateRate: invite.commissionRate,
          templateId: null,
          status: "not_sent",
          sentDate: null,
        },
      });

      return NextResponse.json({
        success: true,
        partnerCode,
        embeddedSigningUrl: null,
        redirectToLogin: true,
        message: `Account created! Our partnership agreements are currently being updated and will be available to sign within 24–48 hours. You'll receive an email when it's ready.`,
      }, { status: 201 });
    }

    const templateId = settings?.agreementTemplate25 || undefined;

    // Send partnership agreement via SignWell — if this fails, roll back
    // the partner + invite so they can retry instead of being stuck pending.
    const partnerName = `${firstName.trim()} ${lastName.trim()}`;
    let documentId: string | null | undefined = null;
    let embeddedSigningUrl: string | null | undefined = null;
    let cosignerSigningUrl: string | null | undefined = null;
    try {
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
      const recipients: Array<{ id: string; email: string; name: string; role: string }> = [
        { id: partnerCode, email: email.trim(), name: partnerName, role: "Partner" },
      ];
      if (settings?.fintellaSignerEmail && settings?.fintellaSignerName) {
        recipients.push({
          id: "fintella_cosigner",
          email: settings.fintellaSignerEmail,
          name: settings.fintellaSignerName,
          role: settings.fintellaSignerPlaceholder || "Fintella",
        });
      }
      const result = await sendForSigning({
        name: `${FIRM_SHORT} Partnership Agreement — ${partnerName} (25%)`,
        subject: `${FIRM_SHORT} Partnership Agreement`,
        message: `Hi ${partnerName}, please review and sign your ${FIRM_NAME} partnership agreement.`,
        recipients,
        templateId,
        templateFields,
      });
      documentId = result.documentId;
      embeddedSigningUrl = result.embeddedSigningUrl;
      cosignerSigningUrl = result.cosignerSigningUrl;
    } catch (signErr: any) {
      console.error("[GetStarted] SignWell failed, rolling back partner:", signErr?.message);
      await prisma.partner.delete({ where: { partnerCode } }).catch(() => {});
      await prisma.partnerProfile.deleteMany({ where: { partnerCode } }).catch(() => {});
      await prisma.recruitmentInvite.update({
        where: { id: invite.id },
        data: { status: "active", usedByPartnerCode: null },
      }).catch(() => {});
      return NextResponse.json({ error: "Failed to send partnership agreement. Please try again." }, { status: 500 });
    }

    await prisma.partnershipAgreement.create({
      data: {
        partnerCode,
        version: 1,
        signwellDocumentId: documentId,
        embeddedSigningUrl: embeddedSigningUrl || null,
        cosignerSigningUrl: cosignerSigningUrl || null,
        templateRate: invite.commissionRate,
        templateId: templateId || null,
        status: "pending",
        sentDate: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      partnerCode,
      embeddedSigningUrl: null,
      redirectToLogin: true,
      message: `Account created! Please log in to review and sign your partnership agreement.`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("[GetStarted] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create account" }, { status: 500 });
  }
}
