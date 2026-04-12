import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/tickets
 * Returns the current partner's support tickets.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { partnerCode },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Get total message counts
    const messageCounts = await prisma.ticketMessage.groupBy({
      by: ["ticketId"],
      _count: true,
    });
    const countMap: Record<string, number> = {};
    for (const mc of messageCounts) {
      countMap[mc.ticketId] = mc._count;
    }

    const enriched = tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      lastReply: t.messages[0]?.createdAt.toISOString() || t.createdAt.toISOString(),
      messages: countMap[t.id] || 0,
    }));

    return NextResponse.json({ tickets: enriched });
  } catch (e) {
    console.error("Tickets API error:", e);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}

/**
 * POST /api/tickets
 * Create a new support ticket for the current partner.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const body = await req.json();
    const { subject, category, message } = body;

    if (!subject?.trim() || !category?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Subject, category, and message are required" }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        partnerCode,
        subject: subject.trim(),
        category: category.trim(),
        status: "open",
        priority: "normal",
        messages: {
          create: {
            authorType: "partner",
            authorId: partnerCode,
            content: message.trim(),
          },
        },
      },
      include: { messages: true },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (e) {
    console.error("Ticket creation error:", e);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
