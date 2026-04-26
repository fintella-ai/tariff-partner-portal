import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (
    !session?.user ||
    !["super_admin", "admin"].includes((session.user as any).role)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const resolved = url.searchParams.get("resolved");
  const category = url.searchParams.get("category");
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 25;

  const where: Record<string, unknown> = {};
  if (resolved === "true") where.resolved = true;
  if (resolved === "false") where.resolved = false;
  if (category) where.category = category;

  const [gaps, total, stats] = await Promise.all([
    prisma.aiKnowledgeGap.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.aiKnowledgeGap.count({ where }),
    prisma.aiKnowledgeGap.groupBy({
      by: ["resolved"],
      _count: true,
    }),
  ]);

  const unresolvedCount = stats.find((s) => !s.resolved)?._count || 0;
  const resolvedCount = stats.find((s) => s.resolved)?._count || 0;

  return NextResponse.json({
    gaps,
    total,
    page,
    pages: Math.ceil(total / limit),
    stats: {
      unresolved: unresolvedCount,
      resolved: resolvedCount,
      total: unresolvedCount + resolvedCount,
    },
  });
}
