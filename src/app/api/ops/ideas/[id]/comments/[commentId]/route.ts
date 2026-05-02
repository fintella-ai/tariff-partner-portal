import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const comment = await prisma.ideaComment.findUnique({
      where: { id: params.commentId },
      select: { id: true, ideaId: true, authorId: true },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (comment.ideaId !== params.id) {
      return NextResponse.json({ error: "Comment does not belong to this idea" }, { status: 400 });
    }

    const isAdmin = ["super_admin", "admin"].includes((session.user as any).role);
    if (comment.authorId !== session.user!.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.ideaComment.delete({ where: { id: params.commentId } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/ops/ideas/[id]/comments/[commentId] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
