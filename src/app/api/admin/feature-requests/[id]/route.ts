import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/feature-requests/[id]
 * Update status, priority, admin notes on a feature request. Super admin only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { id } = await params;

  try {
    const body = await req.json();
    const data: any = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.adminNotes !== undefined) data.adminNotes = body.adminNotes || null;

    const request = await prisma.featureRequest.update({
      where: { id },
      data,
    });

    return NextResponse.json({ request });
  } catch {
    return NextResponse.json({ error: "Failed to update feature request" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/feature-requests/[id]
 * Permanently delete a feature request. Super admin only.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { id } = await params;

  try {
    await prisma.featureRequest.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete feature request" }, { status: 500 });
  }
}
