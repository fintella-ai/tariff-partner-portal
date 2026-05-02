import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    const body = await req.json();
    const { messageId } = body;

    if (!messageId || typeof messageId !== "string") {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const message = await prisma.opsMessage.findUnique({ where: { id: messageId } });
    if (!message || message.channelId !== channelId) {
      return NextResponse.json({ error: "Message not found in this channel" }, { status: 404 });
    }

    const existing = await prisma.opsPinnedMessage.findFirst({
      where: { channelId, messageId },
    });
    if (existing) {
      return NextResponse.json({ error: "Already pinned" }, { status: 409 });
    }

    const pin = await prisma.opsPinnedMessage.create({
      data: {
        channelId,
        messageId,
        pinnedBy: session.user!.id,
      },
      include: {
        message: {
          include: {
            author: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    return NextResponse.json(pin, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/channels/[id]/pins error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = await params;
    const body = await req.json();
    const { messageId } = body;

    if (!messageId || typeof messageId !== "string") {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const pin = await prisma.opsPinnedMessage.findFirst({
      where: { channelId, messageId },
    });
    if (!pin) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }

    await prisma.opsPinnedMessage.delete({ where: { id: pin.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/ops/channels/[id]/pins error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
