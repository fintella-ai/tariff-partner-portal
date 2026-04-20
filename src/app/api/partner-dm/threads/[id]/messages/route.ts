// src/app/api/partner-dm/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canPartnersDm } from "@/lib/partnerDmGate";
import { checkPartnerDmRateLimit } from "@/lib/partnerDmRateLimit";
import { publishPortalChatEvent } from "@/lib/portalChatEvents";

const MAX_CONTENT = 10_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  const partnerName = session?.user?.name || partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) return NextResponse.json({ error: "content too long" }, { status: 400 });

  const thread = await prisma.partnerDmThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.participantA !== partnerCode && thread.participantB !== partnerCode) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Re-validate relationship at send time (tier might have changed).
  const [me, other] = await Promise.all([
    prisma.partner.findUnique({ where: { partnerCode } }),
    prisma.partner.findUnique({ where: { partnerCode: partnerCode === thread.participantA ? thread.participantB : thread.participantA } }),
  ]);
  if (!me || !other || !canPartnersDm(me, other)) {
    return NextResponse.json({ error: "Direct parent-child relationship no longer valid" }, { status: 403 });
  }

  const rate = await checkPartnerDmRateLimit(partnerCode);
  if (!rate.ok) return NextResponse.json({ error: rate.error }, { status: rate.status });

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.partnerDmMessage.create({
      data: {
        threadId: params.id,
        senderPartnerCode: partnerCode,
        content: content.trim(),
      },
    });
    await tx.partnerDmThread.update({
      where: { id: params.id },
      data: { lastMessageAt: new Date() },
    });
    return m;
  });

  const recipient = partnerCode === thread.participantA ? thread.participantB : thread.participantA;
  await prisma.notification.create({
    data: {
      recipientType: "partner",
      recipientId: recipient,
      type: "partner_dm_message",
      title: `${partnerName} sent a message`,
      message: content.slice(0, 100),
      link: `/dashboard/messages/${params.id}`,
    },
  }).catch(() => {});

  await publishPortalChatEvent({ event: "partner_dm.message.created", threadId: params.id, messageId: msg.id });

  return NextResponse.json({ message: msg }, { status: 201 });
}
