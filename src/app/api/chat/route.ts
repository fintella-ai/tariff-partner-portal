import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/chat
 * Returns the current partner's active chat session with messages.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    // Check if live chat is enabled
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    if (!settings?.liveChatEnabled) {
      return NextResponse.json({ enabled: false, session: null });
    }

    // Find active session or return null
    const chatSession = await prisma.chatSession.findFirst({
      where: { partnerCode, status: "active" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    // Mark admin messages as read
    if (chatSession) {
      await prisma.chatMessage.updateMany({
        where: { sessionId: chatSession.id, senderType: "admin", read: false },
        data: { read: true },
      });
    }

    return NextResponse.json({ enabled: true, session: chatSession });
  } catch (e) {
    console.error("Chat GET error:", e);
    return NextResponse.json({ error: "Failed to fetch chat" }, { status: 500 });
  }
}

/**
 * POST /api/chat
 * Send a message in the partner's chat session (creates session if none active).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    if (!settings?.liveChatEnabled) {
      return NextResponse.json({ error: "Live chat is currently offline" }, { status: 400 });
    }

    const body = await req.json();
    const { message } = body;
    if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    // Find or create active session
    let chatSession = await prisma.chatSession.findFirst({
      where: { partnerCode, status: "active" },
      orderBy: { createdAt: "desc" },
    });

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: {
          partnerCode,
          subject: message.trim().substring(0, 100),
        },
      });
    }

    // Create message
    const msg = await prisma.chatMessage.create({
      data: {
        sessionId: chatSession.id,
        senderType: "partner",
        senderId: partnerCode,
        senderName: session.user.name || partnerCode,
        content: message.trim(),
      },
    });

    return NextResponse.json({ message: msg, sessionId: chatSession.id }, { status: 201 });
  } catch (e) {
    console.error("Chat POST error:", e);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
