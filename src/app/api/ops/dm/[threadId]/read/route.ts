import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
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

    await prisma.opsDMParticipant.update({
      where: { threadId_userId: { threadId, userId } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/ops/dm/[threadId]/read error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
