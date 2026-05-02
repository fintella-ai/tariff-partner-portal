import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tests = await prisma.templateAbTest.findMany({ orderBy: { createdAt: "desc" }, include: { variants: true } });
  return NextResponse.json(tests);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, workflowTag, templateType, templateIdA, templateIdB } = await req.json();
  if (!name || !workflowTag || !templateType || !templateIdA || !templateIdB) {
    return NextResponse.json({ error: "name, workflowTag, templateType, templateIdA, templateIdB required" }, { status: 400 });
  }

  const test = await prisma.templateAbTest.create({
    data: {
      name, workflowTag, templateType,
      variants: {
        create: [
          { variant: "A", templateId: templateIdA, templateType },
          { variant: "B", templateId: templateIdB, templateType },
        ],
      },
    },
    include: { variants: true },
  });
  return NextResponse.json(test, { status: 201 });
}
