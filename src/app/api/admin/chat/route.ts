import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/chat
 * Returns all chat sessions for admin agent panel.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sessionId = req.nextUrl.searchParams.get("sessionId");

  try {
    // If sessionId is provided, return that session with messages
    if (sessionId) {
      const chatSession = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!chatSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      // Mark partner messages as read
      await prisma.chatMessage.updateMany({
        where: { sessionId, senderType: "partner", read: false },
        data: { read: true },
      });

      // Get partner info
      const partner = await prisma.partner.findUnique({
        where: { partnerCode: chatSession.partnerCode },
        select: { firstName: true, lastName: true, companyName: true, email: true, id: true },
      });

      const partnerDeals = await prisma.deal.findMany({
        where: { partnerCode: chatSession.partnerCode },
        select: { id: true, dealName: true, legalEntityName: true, clientLastName: true },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({
        session: {
          ...chatSession,
          partnerName: partner ? `${partner.firstName} ${partner.lastName}` : chatSession.partnerCode,
          partnerId: partner?.id || null,
          partnerEmail: partner?.email || null,
          companyName: partner?.companyName || null,
        },
        partnerDeals,
      });
    }

    // Return all sessions with latest message and unread counts
    const sessions = await prisma.chatSession.findMany({
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Get partner names
    const partnerCodes = Array.from(new Set(sessions.map((s) => s.partnerCode)));
    const partners = await prisma.partner.findMany({
      where: { partnerCode: { in: partnerCodes } },
      select: { id: true, partnerCode: true, firstName: true, lastName: true, companyName: true },
    });
    const partnerMap: Record<string, { id: string; name: string; company: string | null }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = { id: p.id, name: `${p.firstName} ${p.lastName}`, company: p.companyName };
    }

    // Get unread counts per session
    const unreadCounts = await prisma.chatMessage.groupBy({
      by: ["sessionId"],
      where: { senderType: "partner", read: false },
      _count: true,
    });
    const unreadMap: Record<string, number> = {};
    for (const u of unreadCounts) {
      unreadMap[u.sessionId] = u._count;
    }

    const enriched = sessions.map((s) => ({
      id: s.id,
      partnerCode: s.partnerCode,
      partnerId: partnerMap[s.partnerCode]?.id || null,
      partnerName: partnerMap[s.partnerCode]?.name || s.partnerCode,
      companyName: partnerMap[s.partnerCode]?.company || null,
      status: s.status,
      subject: s.subject,
      lastMessage: s.messages[0]?.content || null,
      lastMessageAt: s.messages[0]?.createdAt || s.createdAt,
      lastMessageSender: s.messages[0]?.senderType || null,
      unreadCount: unreadMap[s.id] || 0,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({ sessions: enriched });
  } catch (e) {
    console.error("Admin chat GET error:", e);
    return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 });
  }
}

/**
 * POST /api/admin/chat
 * Admin sends a message or closes a session.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();

    if (body.action === "send") {
      const { sessionId, message } = body;
      if (!sessionId || !message?.trim())
        return NextResponse.json({ error: "sessionId and message required" }, { status: 400 });

      const msg = await prisma.chatMessage.create({
        data: {
          sessionId,
          senderType: "admin",
          senderId: session.user.email || "admin",
          senderName: session.user.name || "Support Agent",
          content: message.trim(),
        },
      });

      // Update session updatedAt
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      return NextResponse.json({ message: msg }, { status: 201 });
    }

    if (body.action === "close") {
      const { sessionId } = body;
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { status: "closed", closedAt: new Date() },
      });

      return NextResponse.json({ closed: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Admin chat POST error:", e);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
