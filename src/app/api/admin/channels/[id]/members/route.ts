// src/app/api/admin/channels/[id]/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const codes: string[] = Array.isArray(body?.partnerCodes) ? body.partnerCodes : [];
  if (codes.length === 0) return NextResponse.json({ error: "partnerCodes required" }, { status: 400 });

  // Upsert each — if a soft-removed row exists, restore it as manual
  for (const code of codes) {
    await prisma.channelMembership.upsert({
      where: { channelId_partnerCode: { channelId: params.id, partnerCode: code } },
      update: { source: "manual", removedAt: null, addedByEmail: adminEmail },
      create: { channelId: params.id, partnerCode: code, source: "manual", addedByEmail: adminEmail },
    });
  }
  return NextResponse.json({ ok: true });
}
