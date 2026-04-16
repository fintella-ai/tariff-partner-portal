import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function guardSuperAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "super_admin") return null;
  return session;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workflow = await prisma.workflow.findUnique({
    where: { id: params.id },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ workflow });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, trigger, triggerConfig, conditions, actions, enabled } = body;

  const workflow = await prisma.workflow.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(trigger !== undefined && { trigger }),
      ...(triggerConfig !== undefined && { triggerConfig }),
      ...(conditions !== undefined && { conditions }),
      ...(actions !== undefined && { actions }),
      ...(enabled !== undefined && { enabled }),
    },
  });

  return NextResponse.json({ workflow });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.workflow.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
