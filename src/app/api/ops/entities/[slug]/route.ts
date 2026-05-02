import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = params;

    const entity = await prisma.entity.findUnique({
      where: { slug: slug as any },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: entity.id,
      slug: entity.slug,
      name: entity.name,
      colorAccent: entity.colorAccent,
      createdAt: entity.createdAt,
      members: entity.memberships.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        userRole: m.user.role,
        membershipRole: m.role,
        createdAt: m.createdAt,
      })),
    });
  } catch (e) {
    console.error("GET /api/ops/entities/[slug] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
