import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const t = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const data: any = {};
  for (const f of ["name","subject","bodyHtml","bodyText","category","heading","status","styleId","variableKeys","workflowTags","description"]) { if (body[f] !== undefined) data[f] = body[f]; }
  return NextResponse.json(await prisma.emailTemplate.update({ where: { id }, data }));
}
export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.emailTemplate.update({ where: { id }, data: { status: "archived", enabled: false } });
  return NextResponse.json({ ok: true });
}
