import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [variables, styles, workflows] = await Promise.all([prisma.templateVariable.findMany({ orderBy: { category: "asc" } }), prisma.communicationStyle.findMany({ orderBy: { name: "asc" } }), prisma.workflowAction.findMany({ orderBy: { name: "asc" } })]);
  const grouped: Record<string, typeof variables> = {};
  for (const v of variables) { if (!grouped[v.category]) grouped[v.category] = []; grouped[v.category].push(v); }
  return NextResponse.json({ variables, grouped, styles, workflows });
}
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { key, label, description, category, example } = await req.json();
  if (!key || !label || !category) return NextResponse.json({ error: "key, label, category required" }, { status: 400 });
  return NextResponse.json(await prisma.templateVariable.create({ data: { key, label, description, category, example } }), { status: 201 });
}
