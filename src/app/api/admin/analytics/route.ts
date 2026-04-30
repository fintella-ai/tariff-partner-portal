import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !["super_admin", "admin", "accounting"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    partnerCount,
    activePartners,
    dealCount,
    closedWonDeals,
    totalCommissionPaid,
    leadCount,
    leadsByStatus,
    dossierCount,
    totalEstRefund,
    campaignStats,
    subscriptionStats,
    recentDeals,
    recentPartners,
    emailsSent,
    supportTickets,
  ] = await Promise.all([
    prisma.partner.count(),
    prisma.partner.count({ where: { status: "active" } }),
    prisma.deal.count(),
    prisma.deal.count({ where: { stage: "closed_won" } }),
    prisma.commissionLedger.aggregate({
      where: { status: "paid" },
      _sum: { amount: true },
    }),
    prisma.partnerLead.count(),
    prisma.partnerLead.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.tariffDossier.count(),
    prisma.tariffDossier.aggregate({
      _sum: { totalEstRefund: true },
    }),
    prisma.campaign.findMany({
      select: { name: true, totalLeads: true, sentCount: true, openCount: true, clickCount: true, convertCount: true, status: true },
    }),
    prisma.subscription.groupBy({
      by: ["plan"],
      where: { status: "active" },
      _count: true,
    }),
    prisma.deal.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, dealName: true, stage: true, partnerCode: true, createdAt: true },
    }),
    prisma.partner.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { partnerCode: true, firstName: true, lastName: true, partnerType: true, createdAt: true },
    }),
    prisma.emailLog.count({ where: { status: "sent" } }),
    prisma.supportTicket.count({ where: { status: "open" } }),
  ]);

  const mrr = await prisma.subscription.aggregate({
    where: { status: "active" },
    _sum: { priceMonthly: true },
  });

  return NextResponse.json({
    kpis: {
      totalPartners: partnerCount,
      activePartners,
      totalDeals: dealCount,
      closedWonDeals,
      totalCommissionPaid: Number(totalCommissionPaid._sum.amount || 0),
      totalLeads: leadCount,
      mrr: mrr._sum.priceMonthly || 0,
      emailsSent,
      openTickets: supportTickets,
    },
    calculator: {
      totalDossiers: dossierCount,
      totalEstRefund: Number(totalEstRefund._sum.totalEstRefund || 0),
    },
    leads: Object.fromEntries(leadsByStatus.map((l) => [l.status, l._count])),
    campaigns: campaignStats,
    subscriptions: Object.fromEntries(subscriptionStats.map((s) => [s.plan, s._count])),
    recent: {
      deals: recentDeals,
      partners: recentPartners,
    },
  });
}
