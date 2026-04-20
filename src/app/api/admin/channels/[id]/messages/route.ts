// src/app/api/admin/channels/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { validateCallMeta } from "@/lib/validateCallMeta";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_CONTENT = 10_000;
const rateStore = new Map<string, number[]>();

function hitRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const arr = (rateStore.get(key) || []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT_MAX) return true;
  arr.push(now);
  rateStore.set(key, arr);
  return false;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const before = url.searchParams.get("before");
  const messages = await prisma.channelMessage.findMany({
    where: { channelId: params.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const senderEmail = session?.user?.email;
  const senderName = session?.user?.name || senderEmail || "Admin";
  if (!senderEmail || !isAnyAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rateKey = `${params.id}:${senderEmail}`;
  if (hitRateLimit(rateKey)) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const content = body?.content;
  const messageType = body?.messageType === "call_link" ? "call_link" : "text";
  if (!content || typeof content !== "string" || content.length > MAX_CONTENT) {
    return NextResponse.json({ error: "content required (≤10KB)" }, { status: 400 });
  }
  let callMetaJson: string | null = null;
  if (messageType === "call_link") {
    const v = validateCallMeta(body?.callMeta || {});
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    callMetaJson = JSON.stringify(v.value);
  }

  const channel = await prisma.announcementChannel.findUnique({ where: { id: params.id } });
  if (!channel || channel.archivedAt) return NextResponse.json({ error: "Channel not found or archived" }, { status: 410 });

  const msg = await prisma.channelMessage.create({
    data: {
      channelId: params.id,
      authorEmail: senderEmail,
      authorName: senderName,
      content,
      messageType,
      callMeta: callMetaJson,
    },
  });

  // Fan out notifications to every active member
  const members = await prisma.channelMembership.findMany({
    where: { channelId: params.id, removedAt: null },
    select: { partnerCode: true },
  });
  if (members.length > 0) {
    await prisma.notification.createMany({
      data: members.map((m) => ({
        recipientType: "partner",
        recipientId: m.partnerCode,
        type: "channel_announcement",
        title: `${messageType === "call_link" ? "📞 " : ""}${channel.name}: new announcement`,
        message: content.slice(0, 100),
        link: `/dashboard/announcements?channelId=${params.id}#msg-${msg.id}`,
      })),
    }).catch(() => {});
  }

  await publishPortalChatEvent({
    event: "channel.announcement.created",
    channelId: params.id,
    messageId: msg.id,
  });

  return NextResponse.json({ message: msg }, { status: 201 });
}
