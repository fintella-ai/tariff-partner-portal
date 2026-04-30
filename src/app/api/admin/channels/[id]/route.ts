// src/app/api/admin/channels/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseSegmentRule } from "@/lib/channelSegments";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.announcementChannel.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { memberships: { where: { removedAt: null } }, threads: true } },
    },
  });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recentMessages = await prisma.channelMessage.findMany({
    where: { channelId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ channel, recentMessages: recentMessages.reverse() });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const data: any = {};
  if (typeof body?.name === "string") data.name = body.name;
  if (typeof body?.description === "string" || body?.description === null) data.description = body.description;
  if (typeof body?.segmentRule === "string" || body?.segmentRule === null) {
    if (body.segmentRule) {
      const parsed = parseSegmentRule(body.segmentRule);
      if (!parsed.ok) return NextResponse.json({ error: `segmentRule invalid: ${parsed.error}` }, { status: 400 });
    }
    data.segmentRule = body.segmentRule;
  }
  if (typeof body?.replyMode === "string" && ["disabled", "threads", "open"].includes(body.replyMode)) {
    data.replyMode = body.replyMode;
  }
  const updated = await prisma.announcementChannel.update({ where: { id: params.id }, data });
  return NextResponse.json({ channel: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.announcementChannel.update({ where: { id: params.id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
