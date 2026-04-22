import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";
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
import {
  sendForSigning,
  resolveAgreementTemplateId,
  buildPartnerTemplateFields,
} from "@/lib/signwell";

/**
 * Walk up the chain to find the top-of-chain L1 for a new L2 or L3 partner.
 * Returns null for L1s (no upline) or when the chain can't be resolved.
 * Spec §5: the top-of-chain L1's payoutDownlineEnabled flag governs
 * whether Fintella auto-dispatches a SignWell agreement at signup.
 */
async function resolveTopL1ForNewPartner(
  newPartner: { tier: string; referredByPartnerCode: string | null }
): Promise<{ partnerCode: string; payoutDownlineEnabled: boolean } | null> {
  if (newPartner.tier === "l1" || !newPartner.referredByPartnerCode) return null;

  if (newPartner.tier === "l2") {
    const l1 = await prisma.partner.findUnique({
      where: { partnerCode: newPartner.referredByPartnerCode },
      select: { partnerCode: true, tier: true, payoutDownlineEnabled: true },
    });
    if (l1?.tier === "l1") return l1 as { partnerCode: string; payoutDownlineEnabled: boolean };
    return null;
  }

  if (newPartner.tier === "l3") {
    const l2 = await prisma.partner.findUnique({
      where: { partnerCode: newPartner.referredByPartnerCode },
      select: { referredByPartnerCode: true },
    });
    if (!l2?.referredByPartnerCode) return null;
    const l1 = await prisma.partner.findUnique({
      where: { partnerCode: l2.referredByPartnerCode },
      select: { partnerCode: true, tier: true, payoutDownlineEnabled: true },
    });
    if (l1?.tier === "l1") return l1 as { partnerCode: string; payoutDownlineEnabled: boolean };
    return null;
  }

  return null;
}

/**
 * Auto-dispatch Fintella's SignWell agreement to a new L2/L3 partner whose
 * top-of-chain L1 has payoutDownlineEnabled=true.
 *
 * Mirrors the admin agreement send path at
 * src/app/api/admin/agreement/[partnerCode]/route.ts exactly:
 * same resolveAgreementTemplateId call, same buildPartnerTemplateFields call,
 * same sendForSigning argument shape (recipients array, not simplified fields),
 * same PartnershipAgreement row fields.
 *
 * A post-signup notification is written to the partner's bell so they see
 * "Partnership Agreement Sent" immediately on first login.
 */
async function sendFintellaAgreementForPartnerAtSignup(partner: {
  partnerCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  commissionRate: number;
  tier: string;
}): Promise<void> {
  const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
  if (!settings) throw new Error("PortalSettings missing");

  const effectiveRate = partner.commissionRate;
  const { templateId, templateRate } = resolveAgreementTemplateId(effectiveRate, settings);

  const partnerName = `${partner.firstName} ${partner.lastName}`.trim();

  const templateFields = buildPartnerTemplateFields({
    partnerCode: partner.partnerCode,
    firstName: partner.firstName,
    lastName: partner.lastName,
    fullName: partnerName,
    email: partner.email,
    phone: partner.phone,
  });

  // Build recipient list: partner first, then Fintella co-signer.
  // Matches admin route pattern exactly — co-signer required per memory
  // feedback_signwell_cosigner_required (omitting it causes SignWell 422s).
  const recipients = [
    {
      id: partner.partnerCode,
      email: partner.email,
      name: partnerName,
      role: "Partner",
    },
  ];
  if (settings.fintellaSignerEmail && settings.fintellaSignerName) {
    recipients.push({
      id: "fintella_cosigner",
      email: settings.fintellaSignerEmail,
      name: settings.fintellaSignerName,
      role: (settings as any).fintellaSignerPlaceholder || "Fintella",
    });
  }

  // Determine next version (new partner so will be 1, but be safe).
  const latestVersion = await prisma.partnershipAgreement.findFirst({
    where: { partnerCode: partner.partnerCode },
    orderBy: { version: "desc" },
  });
  const nextVersion = (latestVersion?.version || 0) + 1;

  const { documentId, embeddedSigningUrl, cosignerSigningUrl } = await sendForSigning({
    name: `${FIRM_SHORT} Partnership Agreement — ${partnerName}`,
    subject: `${FIRM_SHORT} Partnership Agreement`,
    message: `Hi ${partner.firstName}, please review and sign your ${FIRM_NAME} partnership agreement.`,
    recipients,
    templateId: templateId || undefined,
    templateFields,
  });

  await prisma.partnershipAgreement.create({
    data: {
      partnerCode: partner.partnerCode,
      version: nextVersion,
      signwellDocumentId: documentId,
      embeddedSigningUrl: embeddedSigningUrl || null,
      cosignerSigningUrl: cosignerSigningUrl ?? null,
      templateRate,
      templateId: templateId || null,
      status: "pending",
      sentDate: new Date(),
    },
  });

  // Notify the partner via notification bell so they see it on first login.
  await prisma.notification.create({
    data: {
      recipientType: "partner",
      recipientId: partner.partnerCode,
      type: "document_request",
      title: "Partnership Agreement Sent",
      message: "Your partnership agreement is ready to sign. Go to Documents to review and sign.",
      link: "/dashboard/documents",
    },
  }).catch(() => {});
}

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
        phone: normalizePhone(phone),
        mobilePhone: normalizePhone(mobilePhone),
        status: "pending", // pending until agreement signed
        referredByPartnerCode: invite.inviterCode,
        tier: invite.targetTier,
        commissionRate: invite.commissionRate,
        recruitedViaInvite: invite.token,
        emailOptIn: !!emailOptIn,
        smsOptIn: !!smsOptIn,
        optInDate: (emailOptIn || smsOptIn) ? new Date() : null,
        payoutDownlineEnabled: invite.payoutDownlineEnabled,
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

    // L2/L3 partners: agreement flow depends on the top-of-chain L1's
    // payoutDownlineEnabled flag. If Enabled, we auto-dispatch Fintella's
    // SignWell above (inside the POST handler block). If Disabled (default),
    // no auto-send — L1 is expected to upload a signed PDF via the admin
    // agreement surface, same as historical behavior. Spec §5.
    if (partner.tier !== "l1") {
      const topL1 = await resolveTopL1ForNewPartner(partner);
      if (topL1?.payoutDownlineEnabled) {
        try {
          await sendFintellaAgreementForPartnerAtSignup({
            partnerCode: partner.partnerCode,
            firstName: partner.firstName,
            lastName: partner.lastName,
            email: partner.email,
            phone: partner.phone,
            commissionRate: partner.commissionRate,
            tier: partner.tier,
          });
        } catch (err) {
          // Don't fail signup if SignWell hiccups. Partner row exists; admin
          // can retry from existing admin agreement surface. Log for ops.
          console.error("[signup] Enabled-mode SignWell auto-dispatch failed", {
            partnerCode: partner.partnerCode,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

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

    // Additive: re-evaluate segment rules on all non-archived channels for this new partner.
    try {
      const channels = await prisma.announcementChannel.findMany({
        where: { archivedAt: null, segmentRule: { not: null } },
        select: { id: true, segmentRule: true },
      });
      if (channels.length > 0) {
        const { parseSegmentRule, evaluateSegmentRule } = await import("@/lib/channelSegments");
        const profile = await prisma.partnerProfile.findUnique({
          where: { partnerCode: partner.partnerCode },
          select: { state: true },
        });
        const signedAgreement = await prisma.partnershipAgreement.count({
          where: { partnerCode: partner.partnerCode, status: { in: ["signed", "approved"] } },
        }) > 0;
        const subject = {
          tier: partner.tier,
          status: partner.status,
          l3Enabled: partner.l3Enabled,
          profile: profile ?? null,
          signedAgreement,
        };
        for (const c of channels) {
          if (!c.segmentRule) continue;
          const parsed = parseSegmentRule(c.segmentRule);
          if (!parsed.ok) continue;
          if (evaluateSegmentRule(parsed.value, subject)) {
            await prisma.channelMembership.upsert({
              where: { channelId_partnerCode: { channelId: c.id, partnerCode: partner.partnerCode } },
              update: {}, // do NOT overwrite an existing manual-remove
              create: {
                channelId: c.id,
                partnerCode: partner.partnerCode,
                source: "segment",
                addedByEmail: "system",
              },
            });
          }
        }
      }
    } catch (e) {
      console.warn("[signup] segment re-eval failed:", (e as Error).message);
    }

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
