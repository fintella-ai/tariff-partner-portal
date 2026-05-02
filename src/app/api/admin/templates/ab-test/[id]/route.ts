import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const test = await prisma.templateAbTest.findUnique({ where: { id }, include: { variants: true } });
  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const variants = test.variants.map((v) => ({
    ...v,
    openRate: v.sends > 0 ? ((v.opens / v.sends) * 100).toFixed(1) : "0.0",
    clickRate: v.sends > 0 ? ((v.clicks / v.sends) * 100).toFixed(1) : "0.0",
    conversionRate: v.sends > 0 ? ((v.conversions / v.sends) * 100).toFixed(1) : "0.0",
  }));

  return NextResponse.json({ ...test, variants });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.winnerVariant !== undefined) data.winnerVariant = body.winnerVariant;
  if (body.status === "completed") data.completedAt = new Date();

  const test = await prisma.templateAbTest.update({ where: { id }, data, include: { variants: true } });
  return NextResponse.json(test);
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.templateAbTest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
