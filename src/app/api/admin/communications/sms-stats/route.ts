import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [totalSent, totalDelivered, totalFailed] = await Promise.all([
    prisma.smsLog.count({ where: { status: "sent" } }),
    prisma.smsLog.count({ where: { status: "delivered" } }),
    prisma.smsLog.count({ where: { status: "failed" } }),
  ]);

  return NextResponse.json({ totalSent, totalDelivered, totalFailed });
}
