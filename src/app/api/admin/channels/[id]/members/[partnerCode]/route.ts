// src/app/api/admin/channels/[id]/members/[partnerCode]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; partnerCode: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.channelMembership.updateMany({
    where: { channelId: params.id, partnerCode: params.partnerCode },
    data: { removedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
