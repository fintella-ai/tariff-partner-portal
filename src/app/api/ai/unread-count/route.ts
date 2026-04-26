import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode as string | undefined;
  if (!partnerCode) {
    return NextResponse.json({ ai: 0, support: 0, chat: 0, total: 0 });
  }

  const [aiUnread, supportUnread, chatUnread] = await Promise.all([
    // AI: unread assistant messages in this partner's conversations
    prisma.aiMessage
      .count({
        where: {
          conversation: { userId: partnerCode, userType: "partner" },
          role: "assistant",
          readAt: null,
        },
      })
      .catch(() => 0),

    // Support: admin replies the partner hasn't read yet
    prisma.ticketMessage
      .count({
        where: {
          ticket: { partnerCode },
          authorType: "admin",
          readAt: null,
        },
      })
      .catch(() => 0),

    // Live chat: admin messages the partner hasn't read yet
    // ChatMessage uses a boolean `read` field (no readAt column)
    prisma.chatMessage
      .count({
        where: {
          session: { partnerCode },
          senderType: "admin",
          read: false,
        },
      })
      .catch(() => 0),
  ]);

  return NextResponse.json({
    ai: aiUnread,
    support: supportUnread,
    chat: chatUnread,
    total: aiUnread + supportUnread + chatUnread,
  });
}
