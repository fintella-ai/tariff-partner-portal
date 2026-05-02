import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entities = await prisma.entity.findMany({
      include: {
        _count: { select: { memberships: true } },
        memberships: {
          where: { userId: session.user!.id },
          select: { role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const result = entities.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      colorAccent: e.colorAccent,
      createdAt: e.createdAt,
      memberCount: e._count.memberships,
      myRole: e.memberships[0]?.role ?? null,
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/ops/entities error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
