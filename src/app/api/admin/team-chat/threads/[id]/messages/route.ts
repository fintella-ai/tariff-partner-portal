// src/app/api/admin/team-chat/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseMentions, parseDealRefs, parsePartnerRefs, stripInvalidTokens } from "@/lib/parseMentions";
import { publishAdminChatEvent } from "@/lib/adminChatEvents";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_CONTENT_LEN = 10_000;
const rateStore = new Map<string, number[]>();

function hitRateLimit(email: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const arr = (rateStore.get(email) || []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT_MAX) return true;
  arr.push(now);
  rateStore.set(email, arr);
  return false;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const senderEmail = session?.user?.email;
  const senderName = session?.user?.name || senderEmail || "Admin";
  if (!senderEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (hitRateLimit(senderEmail)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const rawContent = body?.content;
  if (!rawContent || typeof rawContent !== "string" || rawContent.trim().length === 0) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (rawContent.length > MAX_CONTENT_LEN) {
    return NextResponse.json({ error: "content too long" }, { status: 400 });
  }

  const thread = await prisma.adminChatThread.findUnique({ where: { id: params.id } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  // Validate tokens
  const mentionedEmails = parseMentions(rawContent);
  const dealRefs = parseDealRefs(rawContent);
  const partnerRefs = parsePartnerRefs(rawContent);
  const [validAdmins, validDeals, validPartners] = await Promise.all([
    mentionedEmails.length
      ? prisma.user.findMany({ where: { email: { in: mentionedEmails } }, select: { email: true, name: true } })
      : Promise.resolve([]),
    dealRefs.length
      ? prisma.deal.findMany({ where: { id: { in: dealRefs } }, select: { id: true } })
      : Promise.resolve([]),
    partnerRefs.length
      ? prisma.partner.findMany({ where: { partnerCode: { in: partnerRefs } }, select: { partnerCode: true } })
      : Promise.resolve([]),
  ]);
  const validAdminEmails = validAdmins.map((a) => a.email);
  const validDealIds = validDeals.map((d) => d.id);
  const validPartnerCodes = validPartners.map((p) => p.partnerCode);
  const cleanContent = stripInvalidTokens(rawContent, validAdminEmails, validDealIds, validPartnerCodes);

  // Write in a single transaction: message, mentions, DealNote mirrors, thread bump
  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.adminChatMessage.create({
      data: { threadId: params.id, senderEmail, senderName, content: cleanContent },
    });

    if (validAdminEmails.length) {
      await tx.adminChatMention.createMany({
        data: validAdminEmails.map((email) => ({
          messageId: m.id,
          mentionedAdminEmail: email,
        })),
      });
    }

    // Deal-note mirror: (a) if thread is deal-scoped, (b) for every referenced deal id
    const mirrorDealIds = new Set<string>();
    if (thread.type === "deal" && thread.dealId) mirrorDealIds.add(thread.dealId);
    for (const id of validDealIds) mirrorDealIds.add(id);
    if (mirrorDealIds.size > 0) {
      await tx.dealNote.createMany({
        data: Array.from(mirrorDealIds).map((dealId) => ({
          dealId,
          content: cleanContent,
          authorName: senderName,
          authorEmail: senderEmail,
          sourceChatMessageId: m.id,
        })),
      });
    }

    await tx.adminChatThread.update({
      where: { id: params.id },
      data: { lastMessageAt: new Date() },
    });

    return m;
  });

  // Fire notifications + SSE event (outside the transaction — best-effort)
  for (const email of validAdminEmails) {
    if (email === senderEmail) continue; // don't notify yourself
    await prisma.notification.create({
      data: {
        recipientType: "admin",
        recipientId: email,
        type: "admin_mention",
        title: `${senderName} mentioned you`,
        message: cleanContent.slice(0, 100),
        link: `/admin/team-chat?threadId=${params.id}#msg-${msg.id}`,
      },
    }).catch(() => {});
    await prisma.adminChatMention.updateMany({
      where: { messageId: msg.id, mentionedAdminEmail: email },
      data: { notifiedAt: new Date() },
    }).catch(() => {});
  }
  await publishAdminChatEvent({ event: "message.created", threadId: params.id, messageId: msg.id });

  return NextResponse.json({ message: msg }, { status: 201 });
}
