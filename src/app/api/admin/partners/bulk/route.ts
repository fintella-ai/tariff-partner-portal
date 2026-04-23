import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Bulk partner operations. Super-admin only — these touch many rows
 * at once and mistakes are expensive.
 *
 * PATCH /api/admin/partners/bulk
 *   Body: { partnerIds: string[], status: string }
 *   Updates Partner.status on every row whose id is in the list.
 *   Allowed statuses: active, pending, invited, blocked, inactive.
 *
 * DELETE /api/admin/partners/bulk
 *   Body: { partnerIds: string[] }
 *   Hard-deletes every Partner row whose id is in the list. Prisma's
 *   ON DELETE rules handle cascades (see prisma/schema.prisma for the
 *   per-relation behavior — commissions / documents / agreements).
 */

const ALLOWED_STATUSES = new Set(["active", "pending", "invited", "blocked", "inactive"]);

function requireSuperAdmin(session: any) {
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return { error: NextResponse.json({ error: "Forbidden — super admin only" }, { status: 403 }) };
  }
  return { error: null };
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const gate = requireSuperAdmin(session);
  if (gate.error) return gate.error;

  try {
    const body = await req.json();
    const ids: unknown = body?.partnerIds;
    const status: unknown = body?.status;

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
      return NextResponse.json({ error: "partnerIds must be a non-empty string array" }, { status: 400 });
    }
    if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}` }, { status: 400 });
    }

    const result = await prisma.partner.updateMany({
      where: { id: { in: ids as string[] } },
      data: { status },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (err: any) {
    console.error("[Partners Bulk PATCH]", err);
    return NextResponse.json({ error: err?.message || "Bulk update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const gate = requireSuperAdmin(session);
  if (gate.error) return gate.error;

  try {
    const body = await req.json();
    const ids: unknown = body?.partnerIds;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
      return NextResponse.json({ error: "partnerIds must be a non-empty string array" }, { status: 400 });
    }

    const result = await prisma.partner.deleteMany({
      where: { id: { in: ids as string[] } },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (err: any) {
    console.error("[Partners Bulk DELETE]", err);
    return NextResponse.json({ error: err?.message || "Bulk delete failed" }, { status: 500 });
  }
}
