import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [totalSent, totalBounced, recent, openedCount] = await Promise.all([
    prisma.emailLog.count({ where: { status: "sent" } }),
    prisma.emailLog.count({ where: { status: "failed" } }),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { toEmail: true, subject: true, status: true, createdAt: true } }),
    prisma.emailEvent.count({ where: { event: "open" } }),
  ]);

  return NextResponse.json({
    totalSent,
    totalOpened: openedCount,
    totalBounced,
    recent: recent.map((r) => ({ to: r.toEmail, subject: r.subject, status: r.status, createdAt: r.createdAt.toISOString() })),
  });
}
