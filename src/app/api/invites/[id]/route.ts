import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-log";

/**
 * DELETE /api/invites/[id]
 *
 * Partners: can delete their own active (unused) invites only.
 * Super admins: can delete ANY invite regardless of status or ownership.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role as string | undefined;
  const partnerCode = (session.user as any).partnerCode as string | undefined;
  const isSuperAdmin = role === "super_admin";

  if (!partnerCode && !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invite = await prisma.recruitmentInvite.findUnique({
    where: { id: params.id },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (isSuperAdmin) {
    await prisma.recruitmentInvite.delete({ where: { id: params.id } });
    await logAudit({
      action: "invites.delete",
      actorEmail: session.user.email || "unknown",
      actorRole: role || "super_admin",
      targetType: "RecruitmentInvite",
      targetId: params.id,
      details: {
        inviterCode: invite.inviterCode,
        targetTier: invite.targetTier,
        status: invite.status,
        usedByPartnerCode: invite.usedByPartnerCode,
      },
    });
    return NextResponse.json({ success: true });
  }

  if (invite.inviterCode !== partnerCode) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "active") {
    return NextResponse.json(
      { error: "Only unused invites can be deleted" },
      { status: 409 }
    );
  }

  await prisma.recruitmentInvite.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
