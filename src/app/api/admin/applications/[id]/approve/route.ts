import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/sendgrid";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";
import crypto from "crypto";
import { logAudit } from "@/lib/audit-log";

const ADMIN_ROLES = ["super_admin", "admin"];

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "") ||
  "https://fintella.partners";

function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * POST /api/admin/applications/[id]/approve
 *
 * Admin-only. Approves a PartnerApplication by:
 *   1. Creating a RecruitmentInvite under the application's uplineCode
 *      (default PTNS4XDMN) at tier=L2, commissionRate=0.20, 14-day expiry.
 *   2. Emailing the applicant a congratulatory "you're approved" message
 *      with their `/signup?token=...` link. Email failure is non-fatal
 *      (SignUp link is always returned to admin so they can copy manually).
 *   3. Flipping application.status to "approved", filling approvedAt +
 *      approvedByAdminId, linking inviteId.
 *
 * Body (all optional overrides):
 *   - commissionRate: override the 20% default (0 < rate < upline's rate)
 *   - uplineCode: override the stored uplineCode (admin might want to
 *     place under a different L1 than the landing-page default)
 *   - targetTier: "l2" or "l3" (defaults to "l2")
 *   - expiryDays: override 14-day expiry
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const application = await prisma.partnerApplication.findUnique({ where: { id: params.id } });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (application.status === "approved" && application.inviteId) {
    return NextResponse.json({ error: "Application already approved" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  const uplineCode = String(body.uplineCode ?? application.uplineCode).trim().toUpperCase();
  const targetTier = ["l2", "l3"].includes(body.targetTier) ? body.targetTier : "l2";
  const commissionRate =
    typeof body.commissionRate === "number" && body.commissionRate > 0
      ? body.commissionRate
      : 0.2;
  const expiryDays = typeof body.expiryDays === "number" && body.expiryDays > 0 ? body.expiryDays : 14;

  // Validate upline exists + rate is below upline's rate.
  const upline = await prisma.partner.findUnique({ where: { partnerCode: uplineCode } });
  if (!upline) {
    return NextResponse.json({ error: `Upline partner ${uplineCode} not found` }, { status: 400 });
  }
  if (commissionRate >= upline.commissionRate) {
    return NextResponse.json({
      error: `Commission rate must be less than upline's rate (${Math.round(upline.commissionRate * 100)}%)`,
    }, { status: 400 });
  }

  // Check there's no existing partner with this email (would break signup).
  const existingPartner = await prisma.partner.findFirst({ where: { email: application.email } });
  if (existingPartner) {
    return NextResponse.json({
      error: `A partner with email ${application.email} already exists (${existingPartner.partnerCode})`,
    }, { status: 400 });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const invite = await prisma.recruitmentInvite.create({
    data: {
      token,
      inviterCode: uplineCode,
      targetTier,
      commissionRate,
      status: "active",
      invitedEmail: application.email,
      invitedName: `${application.firstName} ${application.lastName}`.trim(),
      expiresAt,
      // New L2s default to payoutDownlineEnabled=false. Admin can flip
      // later from the partner detail page.
      payoutDownlineEnabled: false,
    },
  });

  const signupUrl = `${PORTAL_URL}/signup?token=${token}`;
  const rateDisplay = `${(commissionRate * 100).toFixed(commissionRate * 100 % 1 === 0 ? 0 : 1)}%`;
  const applicantName = application.firstName || "there";

  const heading = `You're approved — welcome to ${FIRM_SHORT}`;
  const bodyHtml = `
    <p>Hi ${escapeHtml(applicantName)},</p>
    <p>Great news — your application to become a ${escapeHtml(FIRM_NAME)} referral partner has been approved.</p>
    <p>You'll earn <strong>${rateDisplay}</strong> of the firm fee on every client you refer, with full transparency into every deal, commission, and payout inside your partner portal.</p>
    <p>Click the button below to activate your account and sign your partnership agreement. It takes about two minutes.</p>
    <p style="font-size:12px;color:#888;">This activation link expires in ${expiryDays} days.</p>`;
  const bodyText = `Hi ${applicantName},

Your application to become a ${FIRM_NAME} referral partner has been approved.

You'll earn ${rateDisplay} of the firm fee on every client you refer, with full transparency into every deal, commission, and payout inside your partner portal.

Activate your account and sign your agreement here (takes about two minutes):
${signupUrl}

This activation link expires in ${expiryDays} days.`;

  const { html, text } = emailShell({
    preheader: `You're approved — activate your ${FIRM_SHORT} partner account.`,
    heading,
    bodyHtml,
    bodyText,
    ctaLabel: "Activate My Account",
    ctaUrl: signupUrl,
  });

  await sendEmail({
    to: application.email,
    toName: `${application.firstName} ${application.lastName}`.trim() || undefined,
    subject: `You're approved — welcome to ${FIRM_SHORT}`,
    html,
    text,
    template: "application_approved",
    partnerCode: null,
  }).catch((err) => {
    console.error("[applications/approve] email send failed", err);
  });

  const updated = await prisma.partnerApplication.update({
    where: { id: params.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedByAdminId: (session.user as any).id ?? null,
      inviteId: invite.id,
      uplineCode,
      rejectedAt: null,
      rejectionReason: null,
    },
  });

  logAudit({
    action: "application.approve",
    actorEmail: session.user.email || "unknown",
    actorRole: (session.user as any).role || "unknown",
    actorId: session.user.id,
    targetType: "partner_application",
    targetId: params.id,
    details: { inviteId: invite.id, uplineCode, commissionRate, targetTier },
    ipAddress: req.headers.get("x-forwarded-for") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    application: updated,
    invite,
    signupUrl,
  });
}
