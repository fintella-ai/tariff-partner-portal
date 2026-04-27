import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, any> = {};
  if (typeof body.status === "string" && ["pending", "approved", "rejected"].includes(body.status))
    data.status = body.status;
  if (typeof body.approvedResponse === "string")
    data.approvedResponse = body.approvedResponse.trim();
  if (typeof body.adminNotes === "string")
    data.adminNotes = body.adminNotes.trim() || null;
  if (typeof body.category === "string")
    data.category = body.category;

  const rebuttal = await prisma.rebuttal.update({ where: { id: params.id }, data });
  return NextResponse.json({ rebuttal });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.rebuttal.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
