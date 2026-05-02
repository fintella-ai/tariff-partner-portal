import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = await params;
    const { searchParams } = req.nextUrl;
    const cursor = searchParams.get("cursor");
    const parentId = searchParams.get("parentId");
    const take = 50;

    const membership = await prisma.opsChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: session.user!.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const where: Record<string, unknown> = { channelId };
    if (parentId) {
      where.parentId = parentId;
    } else {
      where.parentId = null;
    }

    const messages = await prisma.opsMessage.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
        reactions: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
        _count: { select: { replies: true } },
      },
    });

    const hasMore = messages.length > take;
    const items = hasMore ? messages.slice(0, take) : messages;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({ items, nextCursor });
  } catch (e) {
    console.error("GET /api/ops/channels/[id]/messages error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = await params;

    const membership = await prisma.opsChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: session.user!.id } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const body = await req.json();
    const { content, parentId, contentType } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const mentionRegex = /@\[([a-zA-Z0-9_-]+)\]/g;
    const mentionedIds: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentionedIds.push(match[1]);
    }

    const message = await prisma.opsMessage.create({
      data: {
        channelId,
        authorId: session.user!.id,
        content,
        contentType: contentType || "text",
        parentId: parentId || null,
        mentions: mentionedIds.length
          ? {
              createMany: {
                data: mentionedIds.map((mid) => ({ mentionedId: mid })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
        reactions: true,
        mentions: true,
        _count: { select: { replies: true } },
      },
    });

    await prisma.opsChannel.update({
      where: { id: channelId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/channels/[id]/messages error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
