import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ai/conversations/[id]
 * Returns a single conversation with all its messages.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode as string | undefined;
  const userId = partnerCode || session.user.email || "";
  if (!userId) return NextResponse.json({ error: "Could not identify user" }, { status: 400 });

  const { id } = await params;

  try {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            speakerPersona: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation });
  } catch (err) {
    console.error("[api/ai/conversations/[id]] error:", err);
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

/**
 * DELETE /api/ai/conversations/[id]
 * Permanently delete a conversation and all its messages.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode as string | undefined;
  const userId = partnerCode || session.user.email || "";
  if (!userId) return NextResponse.json({ error: "Could not identify user" }, { status: 400 });

  const { id } = await params;

  try {
    // Verify ownership before deleting
    const existing = await prisma.aiConversation.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    await prisma.aiConversation.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[api/ai/conversations/[id]] delete error:", err);
    return NextResponse.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
