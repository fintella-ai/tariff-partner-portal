import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/broker-funnel/partners?filter=all&sort=deals&page=1
 * Returns Partners who came through the broker funnel with deal/commission stats.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filter = req.nextUrl.searchParams.get("filter") || "all";
  const sort = req.nextUrl.searchParams.get("sort") || "deals";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10));
  const pageSize = 50;

  // Find broker partners: either partnerType = customs_broker on Partner,
  // or they have a matching PartnerApplication with broker referralSource/type
  const brokerApps = await prisma.partnerApplication.findMany({
    where: {
      OR: [
        { referralSource: "broker_landing" },
        { partnerType: "broker" },
      ],
      status: "approved",
    },
    select: { email: true },
  });
  const brokerEmails = brokerApps.map((a) => a.email);

  // Build partner filter
  const statusFilter =
    filter === "active" ? { status: "active" } :
    filter === "pending" ? { status: "pending" } :
    {};

  const where = {
    OR: [
      { partnerType: "customs_broker" },
      ...(brokerEmails.length > 0 ? [{ email: { in: brokerEmails } }] : []),
    ],
    ...statusFilter,
  };

  const partners = await prisma.partner.findMany({
    where,
    select: {
      id: true,
      partnerCode: true,
      firstName: true,
      lastName: true,
      email: true,
      companyName: true,
      partnerType: true,
      status: true,
      commissionRate: true,
      lastActivityAt: true,
      createdAt: true,
    },
  });

  const total = partners.length;
  const partnerCodes = partners.map((p) => p.partnerCode);
  const partnerIds = partners.map((p) => p.id);

  // Batch-fetch deal counts and commission totals
  const [dealCounts, commissionTotals, agreementStatuses, widgetSessions] = await Promise.all([
    prisma.deal.groupBy({
      by: ["partnerCode"],
      where: { partnerCode: { in: partnerCodes } },
      _count: { id: true },
    }),
    prisma.commissionLedger.groupBy({
      by: ["partnerCode"],
      where: { partnerCode: { in: partnerCodes }, status: { in: ["due", "paid"] } },
      _sum: { amount: true },
    }),
    prisma.partnershipAgreement.findMany({
      where: { partnerCode: { in: partnerCodes } },
      select: { partnerCode: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.widgetSession.groupBy({
      by: ["partnerId"],
      where: { partnerId: { in: partnerIds } },
      _count: { id: true },
    }),
  ]);

  const dealMap = Object.fromEntries(dealCounts.map((d) => [d.partnerCode, d._count.id]));
  const commMap = Object.fromEntries(commissionTotals.map((c) => [c.partnerCode, c._sum.amount || 0]));
  // Map partnerId -> id count, then resolve to partnerCode
  const idToCode = Object.fromEntries(partners.map((p) => [p.id, p.partnerCode]));
  const widgetMap: Record<string, number> = {};
  for (const w of widgetSessions) {
    const code = idToCode[w.partnerId];
    if (code) widgetMap[code] = w._count.id;
  }

  // Agreement status: take latest per partner
  const agreeMap: Record<string, string> = {};
  for (const a of agreementStatuses) {
    if (!agreeMap[a.partnerCode]) {
      agreeMap[a.partnerCode] = a.status;
    }
  }

  // Also try to get clientCount from PartnerApplication
  const appClientCounts = await prisma.partnerApplication.findMany({
    where: {
      email: { in: partners.map((p) => p.email) },
      OR: [
        { referralSource: "broker_landing" },
        { partnerType: "broker" },
      ],
    },
    select: { email: true, clientCount: true },
  });
  const clientCountMap = Object.fromEntries(
    appClientCounts.filter((a) => a.clientCount).map((a) => [a.email, a.clientCount])
  );

  const enriched = partners.map((p) => ({
    id: p.id,
    partnerCode: p.partnerCode,
    name: `${p.firstName} ${p.lastName}`,
    email: p.email,
    companyName: p.companyName,
    partnerType: p.partnerType,
    status: p.status,
    commissionRate: p.commissionRate,
    clientBookSize: clientCountMap[p.email] || null,
    dealsSubmitted: dealMap[p.partnerCode] || 0,
    commissionEarned: commMap[p.partnerCode] || 0,
    agreementStatus: agreeMap[p.partnerCode] || "none",
    widgetInstalled: (widgetMap[p.partnerCode] || 0) > 0,
    lastActive: p.lastActivityAt,
    createdAt: p.createdAt,
  }));

  // Sort
  enriched.sort((a, b) => {
    if (sort === "deals") return b.dealsSubmitted - a.dealsSubmitted;
    if (sort === "commission") return b.commissionEarned - a.commissionEarned;
    if (sort === "lastActive") {
      const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
      const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
      return bTime - aTime;
    }
    return 0;
  });

  // Paginate after sort
  const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    partners: paginated,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
