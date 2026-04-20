// src/app/api/announcements/[channelId]/reply-thread/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
const rateStore = new Map<string, number[]>();

function hit(key: string): boolean {
  const now = Date.now();
  const w = now - WINDOW_MS;
  const arr = (rateStore.get(key) || []).filter((t) => t > w);
  if (arr.length >= RATE_LIMIT) return true;
  arr.push(now); rateStore.set(key, arr); return false;
}

async function requireMembership(channelId: string, partnerCode: string) {
  const m = await prisma.channelMembership.findFirst({
    where: { channelId, partnerCode, removedAt: null },
    include: { channel: true },
  });
  if (!m || !m.channel || m.channel.archivedAt) return null;
  return m;
}

export async function GET(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const m = await requireMembership(params.channelId, partnerCode);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let thread = await prisma.channelReplyThread.findUnique({
    where: { channelId_partnerCode: { channelId: params.channelId, partnerCode } },
  });
  if (!thread) {
    thread = await prisma.channelReplyThread.create({
      data: { channelId: params.channelId, partnerCode },
    });
  }
  const messages = await prisma.channelReplyMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });
  // Partner opened → mark admin→partner messages read
  await prisma.channelReplyMessage.updateMany({
    where: { threadId: thread.id, senderType: "admin", readByPartner: false },
    data: { readByPartner: true },
  });
  return NextResponse.json({ thread, messages });
}

export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  const partnerName = session?.user?.name || partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const m = await requireMembership(params.channelId, partnerCode);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (hit(`${params.channelId}:${partnerCode}`)) {
    return NextResponse.json({ error: "Rate limit" }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "string" || content.length > 10_000) {
    return NextResponse.json({ error: "content required (≤10KB)" }, { status: 400 });
  }

  let thread = await prisma.channelReplyThread.findUnique({
    where: { channelId_partnerCode: { channelId: params.channelId, partnerCode } },
  });
  if (!thread) {
    thread = await prisma.channelReplyThread.create({
      data: { channelId: params.channelId, partnerCode },
    });
  }

  const msg = await prisma.channelReplyMessage.create({
    data: {
      threadId: thread.id,
      senderType: "partner",
      senderName: partnerName,
      content,
      readByPartner: true,
    },
  });
  await prisma.channelReplyThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

  // Notify every admin (simple fan-out; in-app notification system only)
  const admins = await prisma.user.findMany({ select: { email: true } });
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      recipientType: "admin",
      recipientId: a.email,
      type: "channel_reply",
      title: `${partnerName} replied in a channel`,
      message: content.slice(0, 100),
      link: `/admin/channels/${params.channelId}?threadId=${thread.id}`,
    })),
  }).catch(() => {});

  await publishPortalChatEvent({
    event: "channel.reply.created",
    channelId: params.channelId,
    threadId: thread.id,
    messageId: msg.id,
  });
  return NextResponse.json({ message: msg }, { status: 201 });
}
