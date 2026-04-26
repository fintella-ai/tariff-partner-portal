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
  const status = url.searchParams.get("status") || "pending";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 20;

  const [candidates, total] = await Promise.all([
    prisma.aiFaqCandidate.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.aiFaqCandidate.count({ where: { status } }),
  ]);

  return NextResponse.json({
    candidates,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
