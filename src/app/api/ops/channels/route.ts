import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const entityId = searchParams.get("entityId");

    const where: Record<string, unknown> = {
      members: { some: { userId: session.user!.id } },
    };
    if (entityId) {
      where.entityId = entityId;
    }

    const channels = await prisma.opsChannel.findMany({
      where,
      include: {
        members: {
          where: { userId: session.user!.id },
          select: { lastReadAt: true },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    });

    const result = await Promise.all(
      channels.map(async (ch) => {
        const memberRecord = ch.members[0];
        const unreadCount = memberRecord
          ? await prisma.opsMessage.count({
              where: {
                channelId: ch.id,
                createdAt: { gt: memberRecord.lastReadAt },
              },
            })
          : 0;

        return {
          id: ch.id,
          entityId: ch.entityId,
          name: ch.name,
          description: ch.description,
          isPrivate: ch.isPrivate,
          isPinned: ch.isPinned,
          createdBy: ch.createdBy,
          createdAt: ch.createdAt,
          updatedAt: ch.updatedAt,
          messageCount: ch._count.messages,
          unreadCount,
        };
      })
    );

    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/ops/channels error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, isPrivate, entityId } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const channel = await prisma.opsChannel.create({
      data: {
        name: name.trim(),
        description: description || null,
        isPrivate: !!isPrivate,
        entityId: entityId || null,
        createdBy: session.user!.id,
        members: {
          create: { userId: session.user!.id },
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      },
    });

    return NextResponse.json(channel, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/channels error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
