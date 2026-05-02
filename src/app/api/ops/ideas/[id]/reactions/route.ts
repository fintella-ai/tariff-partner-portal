import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { emoji } = body;

    if (!emoji || typeof emoji !== "string") {
      return NextResponse.json({ error: "emoji is required" }, { status: 400 });
    }

    const idea = await prisma.idea.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const existing = await prisma.ideaReaction.findUnique({
      where: {
        ideaId_userId_emoji: {
          ideaId: params.id,
          userId: session.user!.id,
          emoji,
        },
      },
    });

    if (existing) {
      await prisma.ideaReaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ toggled: "removed", emoji });
    }

    await prisma.ideaReaction.create({
      data: {
        ideaId: params.id,
        userId: session.user!.id,
        emoji,
      },
    });

    return NextResponse.json({ toggled: "added", emoji }, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/ideas/[id]/reactions error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
