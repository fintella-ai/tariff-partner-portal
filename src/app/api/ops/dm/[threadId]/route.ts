import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
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

    const thread = await prisma.opsDMThread.findUnique({
      where: { id: threadId },
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

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ thread });
  } catch (e) {
    console.error("GET /api/ops/dm/[threadId] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
