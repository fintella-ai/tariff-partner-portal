import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/deal-notes
 * Add an immutable note to a deal's audit log.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { dealId, content } = body;

    if (!dealId || !content?.trim()) {
      return NextResponse.json({ error: "dealId and content are required" }, { status: 400 });
    }

    let authorName = session.user.name || "Admin";
    let authorEmail = session.user.email || "";

    try {
      const adminUser = await prisma.user.findUnique({
        where: { email: session.user.email || "" },
        select: { name: true, email: true },
      });
      if (adminUser?.name) authorName = adminUser.name;
      if (adminUser?.email) authorEmail = adminUser.email;
    } catch {}

    const note = await prisma.dealNote.create({
      data: {
        dealId,
        content: content.trim(),
        authorName,
        authorEmail,
      },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/deal-notes
 * Toggle pin status on a deal note.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { noteId, isPinned } = body;

    if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });

    const note = await prisma.dealNote.update({
      where: { id: noteId },
      data: { isPinned: !!isPinned },
    });

    return NextResponse.json({ note });
  } catch {
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}
