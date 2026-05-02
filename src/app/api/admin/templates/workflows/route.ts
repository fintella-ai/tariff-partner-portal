import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.workflowAction.findMany({ orderBy: { name: "asc" } }));
}
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, tag, description, templateType, requiredVariables } = await req.json();
  if (!name || !tag || !templateType) return NextResponse.json({ error: "name, tag, templateType required" }, { status: 400 });
  return NextResponse.json(await prisma.workflowAction.create({ data: { name, tag, description, templateType, requiredVariables: requiredVariables || [] } }), { status: 201 });
}
