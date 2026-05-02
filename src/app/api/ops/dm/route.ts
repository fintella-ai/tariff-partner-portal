import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userId = session.user!.id;

    const participations = await prisma.opsDMParticipant.findMany({
      where: { userId },
      select: { threadId: true, lastReadAt: true },
    });

    if (participations.length === 0) {
      return NextResponse.json({ threads: [] });
    }

    const threadIds = participations.map((p) => p.threadId);
    const lastReadMap = new Map(participations.map((p) => [p.threadId, p.lastReadAt]));

    const threads = await prisma.opsDMThread.findMany({
      where: { id: { in: threadIds } },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            author: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const unreadResults = await Promise.all(
      threads.map((t) => {
        const lastRead = lastReadMap.get(t.id);
        if (!lastRead) return Promise.resolve({ threadId: t.id, count: 0 });
        return prisma.opsMessage
          .count({
            where: {
              dmThreadId: t.id,
              createdAt: { gt: lastRead },
              authorId: { not: userId },
            },
          })
          .then((count) => ({ threadId: t.id, count }));
      })
    );
    const unreadByThread = new Map(unreadResults.map((r) => [r.threadId, r.count]));

    const result = threads.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      participants: t.participants.map((p) => ({
        id: p.id,
        userId: p.user.id,
        name: p.user.name,
        email: p.user.email,
        role: p.user.role,
        lastReadAt: p.lastReadAt,
      })),
      lastMessage: t.messages[0] || null,
      unreadCount: unreadByThread.get(t.id) || 0,
    }));

    return NextResponse.json({ threads: result });
  } catch (e) {
    console.error("GET /api/ops/dm error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { participantIds } = body as { participantIds: string[] };

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json({ error: "participantIds required" }, { status: 400 });
    }

    const userId = session.user!.id;
    const allUserIds = Array.from(new Set([userId, ...participantIds]));

    if (allUserIds.length < 2) {
      return NextResponse.json({ error: "Need at least one other participant" }, { status: 400 });
    }

    const candidateThreads = await prisma.opsDMParticipant.groupBy({
      by: ["threadId"],
      where: { userId: { in: allUserIds } },
      having: {
        userId: { _count: { equals: allUserIds.length } },
      },
    });

    for (const candidate of candidateThreads) {
      const totalParticipants = await prisma.opsDMParticipant.count({
        where: { threadId: candidate.threadId },
      });
      if (totalParticipants === allUserIds.length) {
        const thread = await prisma.opsDMThread.findUnique({
          where: { id: candidate.threadId },
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, role: true },
                },
              },
            },
          },
        });
        return NextResponse.json({ thread, created: false });
      }
    }

    const thread = await prisma.opsDMThread.create({
      data: {
        participants: {
          create: allUserIds.map((uid) => ({ userId: uid })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ thread, created: true }, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/dm error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
