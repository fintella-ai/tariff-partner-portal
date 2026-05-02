import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idea = await prisma.idea.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const comments = await prisma.ideaComment.findMany({
      where: { ideaId: params.id },
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const topLevel = comments.filter((c) => !c.parentId);
    const childMap: Record<string, typeof comments> = {};
    for (const c of comments) {
      if (c.parentId) {
        if (!childMap[c.parentId]) childMap[c.parentId] = [];
        childMap[c.parentId].push(c);
      }
    }

    const threaded = topLevel.map((c) => ({
      id: c.id,
      ideaId: c.ideaId,
      authorId: c.authorId,
      author: c.author,
      content: c.content,
      parentId: c.parentId,
      createdAt: c.createdAt,
      replies: (childMap[c.id] || []).map((r) => ({
        id: r.id,
        ideaId: r.ideaId,
        authorId: r.authorId,
        author: r.author,
        content: r.content,
        parentId: r.parentId,
        createdAt: r.createdAt,
      })),
    }));

    return NextResponse.json(threaded);
  } catch (e) {
    console.error("GET /api/ops/ideas/[id]/comments error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    const { content, parentId } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const idea = await prisma.idea.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    if (parentId) {
      const parent = await prisma.ideaComment.findFirst({
        where: { id: parentId, ideaId: params.id },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }
    }

    const comment = await prisma.ideaComment.create({
      data: {
        ideaId: params.id,
        authorId: session.user!.id,
        content: content.trim(),
        parentId: parentId || null,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/ideas/[id]/comments error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
