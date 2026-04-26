import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const template = params.get("template") || undefined;
  const status = params.get("status") || undefined;
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "50", 10) || 50));
  const offset = Math.max(0, parseInt(params.get("offset") || "0", 10) || 0);

  const where: any = {};
  if (template) where.template = template;
  if (status) where.status = status;

  const [logs, total] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.emailLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total });
}
