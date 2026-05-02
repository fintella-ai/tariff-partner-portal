import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { threadId } = params;

    const participant = await prisma.opsDMParticipant.findUnique({
      where: { threadId_userId: { threadId, userId: session.user!.id } },
    });

    if (!participant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const cursor = searchParams.get("cursor");
    const limit = 50;

    const messages = await prisma.opsMessage.findMany({
      where: { dmThreadId: threadId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        replies: {
          select: { id: true },
        },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      messages: items,
      nextCursor,
      hasMore,
    });
  } catch (e) {
    console.error("GET /api/ops/dm/[threadId]/messages error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { threadId } = params;
    const userId = session.user!.id;

    const participant = await prisma.opsDMParticipant.findUnique({
      where: { threadId_userId: { threadId, userId } },
    });

    if (!participant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const body = await req.json();
    const { content, contentType, voiceUrl, parentId } = body as {
      content: string;
      contentType?: string;
      voiceUrl?: string;
      parentId?: string;
    };

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    if (parentId) {
      const parentMsg = await prisma.opsMessage.findFirst({
        where: { id: parentId, dmThreadId: threadId },
      });
      if (!parentMsg) {
        return NextResponse.json({ error: "Parent message not found in this thread" }, { status: 400 });
      }
    }

    const [message] = await prisma.$transaction([
      prisma.opsMessage.create({
        data: {
          dmThreadId: threadId,
          authorId: userId,
          content: content.trim(),
          contentType: contentType || "text",
          voiceUrl: voiceUrl || null,
          parentId: parentId || null,
        },
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
          reactions: true,
        },
      }),
      prisma.opsDMThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      }),
      prisma.opsDMParticipant.update({
        where: { threadId_userId: { threadId, userId } },
        data: { lastReadAt: new Date() },
      }),
    ]);

    return NextResponse.json({ message }, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/dm/[threadId]/messages error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
