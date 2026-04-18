import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const logs = await prisma.webhookRequestLog.findMany({
    where: { path: "/api/signwell/webhook" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ logs });
}
