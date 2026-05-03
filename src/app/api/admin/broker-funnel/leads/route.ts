import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/broker-funnel/leads?status=all&search=&page=1
 * Returns PartnerApplications filtered for the broker funnel.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") || "all";
  const search = req.nextUrl.searchParams.get("search") || "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10));
  const pageSize = 50;

  // Base filter: broker funnel applications
  const brokerFilter = {
    OR: [
      { referralSource: "broker_landing" },
      { partnerType: "broker" },
    ],
  };

  // Status filter
  const statusFilter = status !== "all" ? { status } : {};

  // Search filter
  const searchFilter = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { companyName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const where = {
    AND: [brokerFilter, statusFilter, searchFilter].filter(
      (f) => Object.keys(f).length > 0
    ),
  };

  const [leads, total] = await Promise.all([
    prisma.partnerApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.partnerApplication.count({ where }),
  ]);

  // For leads that have been approved, find their Partner record
  const approvedEmails = leads
    .filter((l) => l.status === "approved" && l.inviteId)
    .map((l) => l.email);

  let partnerMap: Record<string, { partnerCode: string; status: string }> = {};
  if (approvedEmails.length > 0) {
    const partners = await prisma.partner.findMany({
      where: { email: { in: approvedEmails } },
      select: { email: true, partnerCode: true, status: true },
    });
    partnerMap = Object.fromEntries(
      partners.map((p) => [p.email, { partnerCode: p.partnerCode, status: p.status }])
    );
  }

  const enrichedLeads = leads.map((lead) => ({
    ...lead,
    partner: partnerMap[lead.email] || null,
  }));

  return NextResponse.json({
    leads: enrichedLeads,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
