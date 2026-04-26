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
  if (typeof body.firstName === "string") data.firstName = body.firstName.trim();
  if (typeof body.lastName === "string") data.lastName = body.lastName.trim();
  if (typeof body.email === "string") data.email = body.email.trim().toLowerCase();
  if (typeof body.phone === "string") data.phone = body.phone.trim() || null;
  if (typeof body.commissionRate === "number") data.commissionRate = Math.min(0.30, Math.max(0.10, body.commissionRate));
  if (typeof body.tier === "string" && ["l1", "l2", "l3"].includes(body.tier)) data.tier = body.tier;
  if (typeof body.referredByCode === "string") data.referredByCode = body.referredByCode.trim() || null;
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (typeof body.status === "string" && ["prospect", "invited", "signed_up", "skipped"].includes(body.status)) data.status = body.status;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const lead = await prisma.partnerLead.update({ where: { id: params.id }, data });
  return NextResponse.json({ lead });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.partnerLead.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
