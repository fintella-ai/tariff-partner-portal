import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
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

    await prisma.opsChannelMember.update({
      where: { channelId_userId: { channelId, userId: session.user!.id } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/ops/channels/[id]/read error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
