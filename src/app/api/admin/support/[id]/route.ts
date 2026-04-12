import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/support/[id]
 * Returns a single ticket with all messages.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    // Get partner name
    const partner = await prisma.partner.findUnique({
      where: { partnerCode: ticket.partnerCode },
      select: { firstName: true, lastName: true, companyName: true, email: true },
    });

    return NextResponse.json({
      ticket: {
        ...ticket,
        partnerName: partner ? `${partner.firstName} ${partner.lastName}` : ticket.partnerCode,
        partnerEmail: partner?.email || null,
        companyName: partner?.companyName || null,
      },
    });
  } catch (e) {
    console.error("Admin support detail error:", e);
    return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/support/[id]
 * Update ticket status/priority or add an admin reply.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const body = await req.json();

    // Update ticket fields
    const updateData: any = {};
    if (body.status) updateData.status = body.status;
    if (body.priority) updateData.priority = body.priority;
    if (body.adminNotes !== undefined) updateData.adminNotes = body.adminNotes;

    if (Object.keys(updateData).length > 0) {
      await prisma.supportTicket.update({ where: { id }, data: updateData });
    }

    // Add admin reply
    if (body.reply) {
      await prisma.ticketMessage.create({
        data: {
          ticketId: id,
          authorType: "admin",
          authorId: session.user.email || "admin",
          content: body.reply,
        },
      });
      // Auto-set to in_progress if it was open
      const ticket = await prisma.supportTicket.findUnique({ where: { id } });
      if (ticket?.status === "open") {
        await prisma.supportTicket.update({ where: { id }, data: { status: "in_progress" } });
      }
    }

    const updated = await prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ ticket: updated });
  } catch (e) {
    console.error("Admin support update error:", e);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}
