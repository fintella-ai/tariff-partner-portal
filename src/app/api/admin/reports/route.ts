import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/reports
 * Returns real analytics: pipeline totals, partner counts, monthly trends, top partners.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [allDeals, allPartners, allCommissions] = await Promise.all([
      prisma.deal.findMany(),
      prisma.partner.findMany(),
      prisma.commissionLedger.findMany(),
    ]);

    const now = new Date();

    // ─── KEY METRICS ──────────────────────────────────────────────────
    const totalPipeline = allDeals.reduce((s, d) => s + d.estimatedRefundAmount, 0);
    const totalCommissionsPaid = allCommissions
      .filter((c) => c.status === "paid")
      .reduce((s, c) => s + c.amount, 0);
    const totalCommissionsDue = allCommissions
      .filter((c) => c.status === "due")
      .reduce((s, c) => s + c.amount, 0);
    const totalCommissionsPending = allCommissions
      .filter((c) => c.status === "pending")
      .reduce((s, c) => s + c.amount, 0);

    const totalPartners = allPartners.length;
    const activePartners = allPartners.filter((p) => p.status === "active").length;

    // Partners created this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newPartnersThisMonth = allPartners.filter(
      (p) => new Date(p.createdAt) >= monthStart
    ).length;

    // Deals this month
    const dealsThisMonth = allDeals.filter(
      (d) => new Date(d.createdAt) >= monthStart
    ).length;
    const closedWonThisMonth = allDeals.filter(
      (d) => d.stage === "closedwon" && new Date(d.updatedAt) >= monthStart
    ).length;

    const totalDeals = allDeals.length;
    const closedWon = allDeals.filter((d) => d.stage === "closedwon").length;
    const conversionRate = totalDeals > 0 ? Math.round((closedWon / totalDeals) * 100) : 0;

    // ─── MONTHLY TRENDS (last 6 months) ──────────────────────────────
    const monthlyData: {
      month: string;
      newDeals: number;
      closedWon: number;
      commPaid: number;
      commDue: number;
      newPartners: number;
    }[] = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const periodKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      monthlyData.push({
        month: label,
        newDeals: allDeals.filter(
          (deal) => new Date(deal.createdAt) >= d && new Date(deal.createdAt) < end
        ).length,
        closedWon: allDeals.filter(
          (deal) =>
            deal.stage === "closedwon" &&
            new Date(deal.updatedAt) >= d &&
            new Date(deal.updatedAt) < end
        ).length,
        commPaid: allCommissions
          .filter((c) => c.status === "paid" && c.periodMonth === periodKey)
          .reduce((s, c) => s + c.amount, 0),
        commDue: allCommissions
          .filter((c) => c.status === "due" && c.periodMonth === periodKey)
          .reduce((s, c) => s + c.amount, 0),
        newPartners: allPartners.filter(
          (p) => new Date(p.createdAt) >= d && new Date(p.createdAt) < end
        ).length,
      });
    }

    // ─── TOP PARTNERS (by total commission) ───────────────────────────
    const partnerCommMap: Record<string, { deals: number; pipeline: number; commission: number }> =
      {};
    for (const deal of allDeals) {
      if (!partnerCommMap[deal.partnerCode]) {
        partnerCommMap[deal.partnerCode] = { deals: 0, pipeline: 0, commission: 0 };
      }
      partnerCommMap[deal.partnerCode].deals += 1;
      partnerCommMap[deal.partnerCode].pipeline += deal.estimatedRefundAmount;
    }
    for (const comm of allCommissions) {
      if (!partnerCommMap[comm.partnerCode]) {
        partnerCommMap[comm.partnerCode] = { deals: 0, pipeline: 0, commission: 0 };
      }
      partnerCommMap[comm.partnerCode].commission += comm.amount;
    }

    const partnerNameMap: Record<string, string> = {};
    for (const p of allPartners) {
      partnerNameMap[p.partnerCode] = `${p.firstName} ${p.lastName}`;
    }

    const topPartners = Object.entries(partnerCommMap)
      .sort(([, a], [, b]) => b.commission - a.commission)
      .slice(0, 10)
      .map(([code, data]) => ({
        name: partnerNameMap[code] || code,
        code,
        ...data,
      }));

    return NextResponse.json({
      stats: {
        totalPipeline,
        totalCommissionsPaid,
        totalCommissionsDue,
        totalCommissionsPending,
        totalPartners,
        activePartners,
        newPartnersThisMonth,
        dealsThisMonth,
        closedWonThisMonth,
        conversionRate,
      },
      monthlyData,
      topPartners,
    });
  } catch (e) {
    console.error("Reports API error:", e);
    return NextResponse.json({ error: "Failed to generate reports" }, { status: 500 });
  }
}
