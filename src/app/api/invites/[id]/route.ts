import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/invites/[id]
 *
 * Delete a RecruitmentInvite created by the current partner.
 * Only allowed when the invite is still `active` (unused). Used or
 * expired invites are part of the partner's recruitment history and
 * cannot be deleted to preserve the audit trail.
 *
 * Returns 404 if the invite doesn't exist or belongs to another partner.
 * Returns 409 if the invite is already used/expired.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const partnerCode = (session.user as any).partnerCode as string | undefined;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  const invite = await prisma.recruitmentInvite.findUnique({
    where: { id: params.id },
  });

  if (!invite || invite.inviterCode !== partnerCode) {
    // 404 to avoid leaking existence of another partner's invites
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
