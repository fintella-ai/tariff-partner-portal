import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: channelId } = await params;

    const members = await prisma.opsChannelMember.findMany({
      where: { channelId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json(members);
  } catch (e) {
    console.error("GET /api/ops/channels/[id]/members error:", e);
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
    const body = await req.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const channel = await prisma.opsChannel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const existing = await prisma.opsChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Already a member" }, { status: 409 });
    }

    const member = await prisma.opsChannelMember.create({
      data: { channelId, userId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/channels/[id]/members error:", e);
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
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const membership = await prisma.opsChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 404 });
    }

    await prisma.opsChannelMember.delete({
      where: { channelId_userId: { channelId, userId } },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/ops/channels/[id]/members error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
