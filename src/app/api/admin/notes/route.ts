import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/notes
 * Add an immutable admin note to a partner's record.
 * Notes cannot be edited or deleted (audit trail).
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
    const { partnerCode, content } = body;

    if (!partnerCode || !content?.trim()) {
      return NextResponse.json({ error: "Partner code and note content are required" }, { status: 400 });
    }

    // Get admin name from account
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

    const note = await prisma.adminNote.create({
      data: {
        partnerCode,
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
 * PATCH /api/admin/notes
 * Toggle pin status on a note. Only admins can pin/unpin.
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

    const note = await prisma.adminNote.update({
      where: { id: noteId },
      data: { isPinned: !!isPinned },
    });

    return NextResponse.json({ note });
  } catch {
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}
