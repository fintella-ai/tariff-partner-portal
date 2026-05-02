import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit-log";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const unused = await prisma.recruitmentInvite.count({
    where: { status: "active", usedByPartnerCode: null },
  });
  const used = await prisma.recruitmentInvite.count({
    where: { usedByPartnerCode: { not: null } },
  });
  const total = await prisma.recruitmentInvite.count();

  return NextResponse.json({ unused, used, total });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Only super_admin can bulk-delete invites" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "unused_only";

  const where =
    mode === "all"
      ? {}
      : mode === "unused_and_expired"
        ? { usedByPartnerCode: null }
        : { status: "active", usedByPartnerCode: null };

  const toDelete = await prisma.recruitmentInvite.findMany({
    where,
    select: { id: true, inviterCode: true, targetTier: true, commissionRate: true },
  });

  if (toDelete.length === 0) {
    return NextResponse.json({ deleted: 0, message: "No unused invites to clean up" });
  }

  const result = await prisma.recruitmentInvite.deleteMany({ where });

  await logAudit({
    action: "invites.bulk_delete",
    actorEmail: session.user.email || "unknown",
    actorRole: role,
    targetType: "RecruitmentInvite",
    details: {
      deleted: result.count,
      mode,
      sample: toDelete.slice(0, 5).map((i) => ({
        inviter: i.inviterCode,
        tier: i.targetTier,
        rate: i.commissionRate,
      })),
    },
  });

  return NextResponse.json({
    deleted: result.count,
    message: `Deleted ${result.count} invite${result.count !== 1 ? "s" : ""}`,
  });
}
