import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendL1InviteEmail } from "@/lib/sendgrid";
import { logAudit } from "@/lib/audit-log";
import crypto from "crypto";

const ADMIN_ROLES = ["super_admin", "admin"];
const PORTAL_URL = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";

function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const lead = await prisma.partnerLead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.status === "invited") return NextResponse.json({ error: "Already invited" }, { status: 409 });

  const token = generateToken();
  const invite = await prisma.recruitmentInvite.create({
    data: {
      token,
      targetTier: lead.tier,
      commissionRate: lead.commissionRate,
      invitedEmail: lead.email,
      invitedName: `${lead.firstName} ${lead.lastName}`,
      inviterCode: lead.referredByCode || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      payoutDownlineEnabled: true,
    },
  });

  await prisma.partnerLead.update({
    where: { id: params.id },
    data: { status: "invited", inviteId: invite.id },
  });

  const signupUrl = `${PORTAL_URL}/getstarted?token=${token}`;
  sendL1InviteEmail({
    toEmail: lead.email,
    toName: `${lead.firstName} ${lead.lastName}`,
    signupUrl,
    commissionRate: lead.commissionRate ?? undefined,
  }).catch(() => {});

  logAudit({
    action: "lead.invited",
    actorEmail: session.user.email || "unknown",
    actorRole: (session.user as any).role || "unknown",
    actorId: session.user.id,
    targetType: "partner_lead",
    targetId: params.id,
    details: { inviteId: invite.id, email: lead.email },
    ipAddress: req.headers.get("x-forwarded-for") || undefined,
    userAgent: req.headers.get("user-agent") || undefined,
  }).catch(() => {});

  return NextResponse.json({ success: true, inviteId: invite.id, signupUrl });
}
