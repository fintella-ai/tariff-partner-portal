import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";

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
    const attachments: any[] = Array.isArray(body.attachments) ? body.attachments : [];

    const trimmedContent = typeof content === "string" ? content.trim() : "";
    if (!dealId || (!trimmedContent && attachments.length === 0)) {
      return NextResponse.json({ error: "dealId and either content or an attachment are required" }, { status: 400 });
    }

    // Same per-attachment (~4MB) + combined (~11MB) cap pattern as /api/admin/notes.
    let total = 0;
    for (const a of attachments) {
      if (typeof a?.url !== "string" || !a.url) {
        return NextResponse.json({ error: "Each attachment requires a data url" }, { status: 400 });
      }
      if (a.url.length > 5_500_000) {
        return NextResponse.json({ error: `Attachment ${a.name || ""} too large (max ~4MB each)` }, { status: 413 });
      }
      total += a.url.length;
    }
    if (total > 15_000_000) {
      return NextResponse.json({ error: "Combined attachment size too large (max ~11MB)" }, { status: 413 });
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
        content: trimmedContent,
        authorName,
        authorEmail,
        ...(attachments.length > 0 ? {
          attachments: {
            create: attachments.map((a: any) => ({
              name: typeof a.name === "string" ? a.name.slice(0, 255) : "attachment",
              url: a.url,
              type: typeof a.type === "string" ? a.type.slice(0, 128) : null,
              size: typeof a.size === "number" && isFinite(a.size) ? Math.round(a.size) : null,
            })),
          },
        } : {}),
      },
      include: { attachments: true },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/deal-notes
 *
 * Two shapes (mirrors /api/admin/notes):
 *   { noteId, isPinned }        — toggle pin. Open to all admin roles.
 *   { noteId, content }         — edit note body. ⭐ Star super admin only.
 *                                 (Notes are otherwise immutable audit trail.)
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const isStar = isStarSuperAdminEmail(session.user.email);

  try {
    const body = await req.json();
    const { noteId, isPinned, content } = body;

    if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });

    const data: { isPinned?: boolean; content?: string } = {};
    if (typeof isPinned === "boolean") data.isPinned = isPinned;
    if (typeof content === "string") {
      if (!isStar) {
        return NextResponse.json(
          { error: "Only the star super admin (admin@fintella.partners) can edit note content" },
          { status: 403 }
        );
      }
      const trimmed = content.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Note content cannot be empty" }, { status: 400 });
      }
      data.content = trimmed;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const note = await prisma.dealNote.update({
      where: { id: noteId },
      data,
    });

    return NextResponse.json({ note });
  } catch {
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/deal-notes?noteId=cln123
 *
 * ⭐ Star super admin only. Deal notes are otherwise immutable audit trail —
 * this escape hatch exists so John can cull accidental or test notes.
 * Cascades to child NoteAttachment rows via Prisma schema.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isStarSuperAdminEmail(session.user.email)) {
    return NextResponse.json(
      { error: "Only the star super admin (admin@fintella.partners) can delete deal notes" },
      { status: 403 }
    );
  }

  try {
    const url = new URL(req.url);
    const noteId = url.searchParams.get("noteId");
    if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });

    await prisma.dealNote.delete({ where: { id: noteId } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
