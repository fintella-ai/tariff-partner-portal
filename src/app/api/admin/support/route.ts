import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/support
 * Returns all support tickets with message counts and partner info.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const statusFilter = req.nextUrl.searchParams.get("status");
    const where: any = {};
    if (statusFilter && statusFilter !== "all") where.status = statusFilter;

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });

    // Get partner names
    const partners = await prisma.partner.findMany({
      select: { partnerCode: true, firstName: true, lastName: true, companyName: true },
    });
    const partnerMap: Record<string, { name: string; company: string | null }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = {
        name: `${p.firstName} ${p.lastName}`,
        company: p.companyName,
      };
    }

    const enriched = tickets.map((t) => ({
      id: t.id,
      partnerCode: t.partnerCode,
      partnerName: partnerMap[t.partnerCode]?.name || t.partnerCode,
      companyName: partnerMap[t.partnerCode]?.company || null,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      lastReply: t.messages[0]?.createdAt.toISOString() || t.createdAt.toISOString(),
      messageCount: t.messages.length,
    }));

    // Also get total message counts per ticket (the include above only gets last 1)
    const messageCounts = await prisma.ticketMessage.groupBy({
      by: ["ticketId"],
      _count: true,
    });
    const countMap: Record<string, number> = {};
    for (const mc of messageCounts) {
      countMap[mc.ticketId] = mc._count;
    }
    for (const t of enriched) {
      t.messageCount = countMap[t.id] || 0;
    }

    // Stats
    const allTickets = await prisma.supportTicket.findMany({ select: { status: true } });
    const stats = {
      total: allTickets.length,
      open: allTickets.filter((t) => t.status === "open").length,
      inProgress: allTickets.filter((t) => t.status === "in_progress").length,
      resolved: allTickets.filter((t) => t.status === "resolved").length,
    };

    return NextResponse.json({ tickets: enriched, stats });
  } catch (e) {
    console.error("Admin support API error:", e);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }
}
