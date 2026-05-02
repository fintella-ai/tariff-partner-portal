import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      action: { startsWith: "ai_permissions" },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const parsed = logs.map((log) => ({
    id: log.id,
    action: log.action,
    actorEmail: log.actorEmail,
    actorRole: log.actorRole,
    targetType: log.targetType,
    targetId: log.targetId,
    details: log.details ? JSON.parse(log.details as string) : null,
    createdAt: log.createdAt.toISOString(),
  }));

  return NextResponse.json({ history: parsed });
}
