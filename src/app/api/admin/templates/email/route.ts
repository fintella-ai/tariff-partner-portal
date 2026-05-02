import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const where: any = {};
  if (status && status !== "all") where.status = status;
  if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { subject: { contains: search, mode: "insensitive" } }];
  const templates = await prisma.emailTemplate.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100 });
  return NextResponse.json({ templates, total: templates.length });
}
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.name || !body.subject) return NextResponse.json({ error: "name and subject required" }, { status: 400 });
  const key = body.key || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const t = await prisma.emailTemplate.create({ data: { key, name: body.name, subject: body.subject, bodyHtml: body.bodyHtml || "", bodyText: body.bodyText || "", category: body.category || "General", heading: body.heading || body.name, status: "draft" } });
  return NextResponse.json(t, { status: 201 });
}
