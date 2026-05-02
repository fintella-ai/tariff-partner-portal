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
      include: {
        author: {
          select: { id: true, name: true, email: true, role: true },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
          orderBy: { createdAt: "asc" },
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

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const reactionMap: Record<string, { count: number; users: { id: string; name: string | null; email: string }[] }> = {};
    for (const r of idea.reactions) {
      if (!reactionMap[r.emoji]) {
        reactionMap[r.emoji] = { count: 0, users: [] };
      }
      reactionMap[r.emoji].count++;
      reactionMap[r.emoji].users.push(r.user);
    }

    const topLevel = idea.comments.filter((c) => !c.parentId);
    const childMap: Record<string, typeof idea.comments> = {};
    for (const c of idea.comments) {
      if (c.parentId) {
        if (!childMap[c.parentId]) childMap[c.parentId] = [];
        childMap[c.parentId].push(c);
      }
    }

    const threadedComments = topLevel.map((c) => ({
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

    return NextResponse.json({
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
      comments: threadedComments,
      entityTags: idea.entityTags.map((t) => t.entity),
    });
  } catch (e) {
    console.error("GET /api/ops/ideas/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idea = await prisma.idea.findUnique({
      where: { id: params.id },
      select: { authorId: true },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const isAdmin = ["super_admin", "admin"].includes((session.user as any).role);
    if (idea.authorId !== session.user!.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, body: ideaBody, status, entityIds, voiceUrl } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (ideaBody !== undefined) data.body = ideaBody;
    if (status !== undefined) data.status = status;
    if (voiceUrl !== undefined) data.voiceUrl = voiceUrl;
    if (entityIds !== undefined) data.entityIds = entityIds;

    const updated = await prisma.$transaction(async (tx) => {
      if (entityIds !== undefined && Array.isArray(entityIds)) {
        await tx.ideaEntityTag.deleteMany({ where: { ideaId: params.id } });
        if (entityIds.length > 0) {
          const entities = await tx.entity.findMany({
            where: { id: { in: entityIds } },
            select: { id: true },
          });
          if (entities.length > 0) {
            await tx.ideaEntityTag.createMany({
              data: entities.map((ent) => ({
                ideaId: params.id,
                entityId: ent.id,
              })),
            });
          }
        }
      }

      return tx.idea.update({
        where: { id: params.id },
        data,
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
    });

    return NextResponse.json({
      ...updated,
      entityTags: updated.entityTags.map((t) => t.entity),
    });
  } catch (e) {
    console.error("PATCH /api/ops/ideas/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
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
      select: { authorId: true },
    });

    if (!idea) {
      return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    }

    const isAdmin = ["super_admin", "admin"].includes((session.user as any).role);
    if (idea.authorId !== session.user!.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.idea.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/ops/ideas/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
