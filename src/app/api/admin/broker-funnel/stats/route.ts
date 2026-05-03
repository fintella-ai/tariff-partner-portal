import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/broker-funnel/stats
 * Returns funnel stage counts, time-based aggregations, book size distribution,
 * and top UTM sources for the broker partner funnel.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const range = req.nextUrl.searchParams.get("range") || "all";
  let since: Date | undefined;
  const now = new Date();
  if (range === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "month") {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const dateFilter = since ? { createdAt: { gte: since } } : {};

  // ── Funnel stage counts ──────────────────────────────────────────────────

  // Stage 1: Page visits — count ClientSubmissions from broker landing
  // (This is a proxy; real page analytics would come from Vercel/GA)
  const pageVisits = await prisma.clientSubmission.count({
    where: { source: "broker_landing", ...dateFilter },
  }).catch(() => 0);

  // Stage 2: Calculator used — partner applications that came through broker funnel
  // We approximate using the total broker applications as calculator implies engagement
  const calculatorUsed = await prisma.partnerApplication.count({
    where: {
      OR: [
        { referralSource: "broker_landing" },
        { partnerType: "broker" },
      ],
      ...dateFilter,
    },
  });

  // Stage 3: Form submitted — same as above, all broker applications
  const formSubmitted = calculatorUsed;

  // Stage 4: Invite sent — broker applications where inviteId is set
  const inviteSent = await prisma.partnerApplication.count({
    where: {
      OR: [
        { referralSource: "broker_landing" },
        { partnerType: "broker" },
      ],
      inviteId: { not: null },
      ...dateFilter,
    },
  });

  // Stage 5: Agreement signed — broker applications that are approved
  const agreementSigned = await prisma.partnerApplication.count({
    where: {
      OR: [
        { referralSource: "broker_landing" },
        { partnerType: "broker" },
      ],
      status: "approved",
      ...dateFilter,
    },
  });

  // Stage 6: First referral — customs_broker partners who have submitted at least 1 deal
  const brokersWithDeals = await prisma.partner.findMany({
    where: {
      partnerType: "customs_broker",
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: { partnerCode: true },
  });
  let firstReferralCount = 0;
  if (brokersWithDeals.length > 0) {
    const codes = brokersWithDeals.map((p) => p.partnerCode);
    const partnersWithDeals = await prisma.deal.groupBy({
      by: ["partnerCode"],
      where: { partnerCode: { in: codes } },
      _count: { id: true },
    });
    firstReferralCount = partnersWithDeals.filter((g) => g._count.id > 0).length;
  }

  // ── Time-based aggregation (all broker applications) ─────────────────────
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const brokerWhere = { OR: [{ referralSource: "broker_landing" }, { partnerType: "broker" }] };

  const [thisWeek, thisMonth, allTime] = await Promise.all([
    prisma.partnerApplication.count({ where: { ...brokerWhere, createdAt: { gte: weekAgo } } }),
    prisma.partnerApplication.count({ where: { ...brokerWhere, createdAt: { gte: monthAgo } } }),
    prisma.partnerApplication.count({ where: brokerWhere }),
  ]);

  // ── Broker vs referral split (all partner applications) ──────────────────
  const [brokerCount, referralCount] = await Promise.all([
    prisma.partnerApplication.count({ where: { ...brokerWhere, ...dateFilter } }),
    prisma.partnerApplication.count({
      where: {
        AND: [
          { NOT: { referralSource: "broker_landing" } },
          { NOT: { partnerType: "broker" } },
        ],
        ...dateFilter,
      },
    }),
  ]);

  // ── Client book size distribution ────────────────────────────────────────
  const sizeGroups = await prisma.partnerApplication.groupBy({
    by: ["clientCount"],
    where: { ...brokerWhere, clientCount: { not: null }, ...dateFilter },
    _count: { id: true },
  });
  const bookSizeDistribution = {
    "0-10": 0,
    "10-25": 0,
    "25-50": 0,
    "50+": 0,
  };
  for (const g of sizeGroups) {
    const key = g.clientCount as string;
    if (key in bookSizeDistribution) {
      bookSizeDistribution[key as keyof typeof bookSizeDistribution] = g._count.id;
    }
  }

  // ── Top UTM sources ──────────────────────────────────────────────────────
  const utmGroups = await prisma.partnerApplication.groupBy({
    by: ["utmSource"],
    where: { ...brokerWhere, utmSource: { not: null }, ...dateFilter },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  const topUtmSources = utmGroups.map((g) => ({
    source: g.utmSource || "direct",
    count: g._count.id,
  }));

  return NextResponse.json({
    funnel: {
      pageVisits: pageVisits + calculatorUsed, // combine both signals
      calculatorUsed,
      formSubmitted,
      inviteSent,
      agreementSigned,
      firstReferral: firstReferralCount,
    },
    timeBased: { thisWeek, thisMonth, allTime },
    split: { broker: brokerCount, referral: referralCount },
    bookSizeDistribution,
    topUtmSources,
  });
}
