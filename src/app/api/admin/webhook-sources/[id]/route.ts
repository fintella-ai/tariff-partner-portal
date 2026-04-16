import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function guardSuperAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "super_admin") return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, description, actions, enabled } = body;

  const source = await prisma.webhookSource.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(actions !== undefined && { actions }),
      ...(enabled !== undefined && { enabled }),
    },
  });

  return NextResponse.json({ source });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.webhookSource.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
