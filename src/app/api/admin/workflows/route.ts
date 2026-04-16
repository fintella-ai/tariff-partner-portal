import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function guardSuperAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "super_admin") return null;
  return session;
}

export async function GET() {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workflows = await prisma.workflow.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      logs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, status: true },
      },
    },
  });

  return NextResponse.json({ workflows });
}

export async function POST(req: NextRequest) {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, trigger, triggerConfig, conditions, actions, enabled } = body;

  if (!name || !trigger || !actions) {
    return NextResponse.json({ error: "name, trigger, and actions are required" }, { status: 400 });
  }

  const workflow = await prisma.workflow.create({
    data: {
      name,
      description: description || null,
      trigger,
      triggerConfig: triggerConfig || null,
      conditions: conditions || null,
      actions,
      enabled: enabled !== false,
    },
  });

  return NextResponse.json({ workflow }, { status: 201 });
}
