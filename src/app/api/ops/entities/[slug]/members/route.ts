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
      select: { id: true },
    });

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const memberships = await prisma.entityMembership.findMany({
      where: { entityId: entity.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      memberships.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        userRole: m.user.role,
        membershipRole: m.role,
        createdAt: m.createdAt,
      }))
    );
  } catch (e) {
    console.error("GET /api/ops/entities/[slug]/members error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if ((session.user as any).role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = params;
    const body = await req.json();
    const { userId, role } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const entity = await prisma.entity.findUnique({
      where: { slug: slug as any },
      select: { id: true },
    });

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const membership = await prisma.entityMembership.create({
      data: {
        userId,
        entityId: entity.id,
        role: role || "partner",
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return NextResponse.json(
      {
        id: membership.id,
        userId: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        userRole: membership.user.role,
        membershipRole: membership.role,
        createdAt: membership.createdAt,
      },
      { status: 201 }
    );
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }
    console.error("POST /api/ops/entities/[slug]/members error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if ((session.user as any).role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = params;
    const body = await req.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const entity = await prisma.entity.findUnique({
      where: { slug: slug as any },
      select: { id: true },
    });

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const existing = await prisma.entityMembership.findUnique({
      where: { userId_entityId: { userId, entityId: entity.id } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    await prisma.entityMembership.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/ops/entities/[slug]/members error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
