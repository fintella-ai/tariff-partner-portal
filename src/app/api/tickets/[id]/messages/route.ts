import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/tickets/[id]/messages
 * Returns all messages for a ticket (partner must own the ticket).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const { id } = await params;

  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.partnerCode !== partnerCode)
      return NextResponse.json({ error: "Not your ticket" }, { status: 403 });

    return NextResponse.json({ ticket });
  } catch (e) {
    console.error("Ticket messages error:", e);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

/**
 * POST /api/tickets/[id]/messages
 * Add a reply to a ticket (partner must own the ticket).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  const { id } = await params;

  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (ticket.partnerCode !== partnerCode)
      return NextResponse.json({ error: "Not your ticket" }, { status: 403 });

    if (ticket.status === "closed")
      return NextResponse.json({ error: "Ticket is closed" }, { status: 400 });

    const body = await req.json();
    if (!body.message?.trim())
      return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const msg = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        authorType: "partner",
        authorId: partnerCode,
        content: body.message.trim(),
      },
    });

    // Reopen if it was resolved
    if (ticket.status === "resolved") {
      await prisma.supportTicket.update({ where: { id }, data: { status: "open" } });
    }

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    console.error("Ticket reply error:", e);
    return NextResponse.json({ error: "Failed to add reply" }, { status: 500 });
  }
}
