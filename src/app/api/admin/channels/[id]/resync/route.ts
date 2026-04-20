// src/app/api/admin/channels/[id]/resync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseSegmentRule, expandSegmentMatches } from "@/lib/channelSegments";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.announcementChannel.findUnique({ where: { id: params.id } });
  if (!channel || !channel.segmentRule) return NextResponse.json({ added: 0 });
  const parsed = parseSegmentRule(channel.segmentRule);
  if (!parsed.ok) return NextResponse.json({ error: "segmentRule invalid" }, { status: 400 });

  const matches = await expandSegmentMatches(parsed.value);
  const existing = await prisma.channelMembership.findMany({
    where: { channelId: params.id, partnerCode: { in: matches } },
    select: { partnerCode: true, source: true, removedAt: true },
  });
  const existingMap = new Map(existing.map((e) => [e.partnerCode, e]));
  const toAdd = matches.filter((c) => !existingMap.has(c));
  if (toAdd.length > 0) {
    await prisma.channelMembership.createMany({
      data: toAdd.map((partnerCode) => ({
        channelId: params.id,
        partnerCode,
        source: "segment",
        addedByEmail: adminEmail,
      })),
    });
  }
  return NextResponse.json({ added: toAdd.length });
}
