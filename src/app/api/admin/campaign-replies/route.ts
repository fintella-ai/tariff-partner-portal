import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["super_admin", "admin"];

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "all";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 30;

  const where: Record<string, unknown> = {
    leadId: { not: null },
  };

  if (filter === "unread") where.read = false;
  if (filter === "unreplied") {
    where.replied = false;
    where.read = true;
  }
  if (filter === "replied") where.replied = true;

  const [replies, total] = await Promise.all([
    prisma.inboundEmail.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.inboundEmail.count({ where }),
  ]);

  const leadIds = replies.map((r) => r.leadId).filter(Boolean) as string[];
  const leads = leadIds.length > 0
    ? await prisma.partnerLead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, firstName: true, lastName: true, email: true, notes: true, status: true, state: true },
      })
    : [];
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l]));

  const enriched = replies.map((r) => ({
    ...r,
    lead: r.leadId ? leadMap[r.leadId] || null : null,
  }));

  return NextResponse.json({ replies: enriched, total, page, limit });
}
