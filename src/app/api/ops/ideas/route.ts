import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const entityId = searchParams.get("entityId");
    const authorId = searchParams.get("authorId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (authorId) where.authorId = authorId;
    if (entityId) {
      where.entityTags = { some: { entityId } };
    }

    const ideas = await prisma.idea.findMany({
      where,
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
        reactions: {
          select: { emoji: true, userId: true },
        },
        _count: { select: { comments: true } },
        entityTags: {
          include: {
            entity: {
              select: { id: true, slug: true, name: true, colorAccent: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = ideas.map((idea) => {
      const reactionMap: Record<string, { count: number; userIds: string[] }> = {};
      for (const r of idea.reactions) {
        if (!reactionMap[r.emoji]) {
          reactionMap[r.emoji] = { count: 0, userIds: [] };
        }
        reactionMap[r.emoji].count++;
        reactionMap[r.emoji].userIds.push(r.userId);
      }

      return {
        id: idea.id,
        authorId: idea.authorId,
        author: idea.author,
        title: idea.title,
        body: idea.body,
        status: idea.status,
        entityIds: idea.entityIds,
        voiceUrl: idea.voiceUrl,
        createdAt: idea.createdAt,
        updatedAt: idea.updatedAt,
        reactions: reactionMap,
        commentCount: idea._count.comments,
        entityTags: idea.entityTags.map((t) => t.entity),
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/ops/ideas error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, body: ideaBody, entityIds, voiceUrl } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const tagData: { entityId: string }[] = [];
    if (Array.isArray(entityIds) && entityIds.length > 0) {
      const entities = await prisma.entity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true },
      });
      for (const ent of entities) {
        tagData.push({ entityId: ent.id });
      }
    }

    const idea = await prisma.idea.create({
      data: {
        authorId: session.user!.id,
        title: title.trim(),
        body: ideaBody || null,
        entityIds: Array.isArray(entityIds) ? entityIds : [],
        voiceUrl: voiceUrl || null,
        entityTags: tagData.length > 0 ? { create: tagData } : undefined,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
        entityTags: {
          include: {
            entity: {
              select: { id: true, slug: true, name: true, colorAccent: true },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        ...idea,
        entityTags: idea.entityTags.map((t) => t.entity),
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("POST /api/ops/ideas error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
