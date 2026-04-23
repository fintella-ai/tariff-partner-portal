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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
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
    //
    // `deals` / `pipeline` count BOTH the partner's own deals (where they
    // are the submitter) AND the deals they earn override commission on
    // (via CommissionLedger rows that reference those deals). Without this,
    // an L1 earning L2/L3 overrides would show `deals=0, commission=$X`,
    // which reads as a bug even though the commission is legitimate.
    const dealById = new Map(allDeals.map((d) => [d.id, d]));
    const partnerCommMap: Record<string, { dealIds: Set<string>; pipeline: number; commission: number }> = {};

    for (const deal of allDeals) {
      const m = (partnerCommMap[deal.partnerCode] ??= { dealIds: new Set(), pipeline: 0, commission: 0 });
      m.dealIds.add(deal.id);
      m.pipeline += deal.estimatedRefundAmount;
    }
    for (const comm of allCommissions) {
      const m = (partnerCommMap[comm.partnerCode] ??= { dealIds: new Set(), pipeline: 0, commission: 0 });
      m.commission += comm.amount;
      if (comm.dealId) {
        const deal = dealById.get(comm.dealId);
        // Only count the deal if it still exists (protects against orphaned
        // ledger rows that outlived a deleted deal) and hasn't already been
        // counted above.
        if (deal && !m.dealIds.has(comm.dealId)) {
          m.dealIds.add(comm.dealId);
          m.pipeline += deal.estimatedRefundAmount;
        }
      }
    }

    const partnerInfoMap: Record<string, { name: string; id: string }> = {};
    for (const p of allPartners) {
      partnerInfoMap[p.partnerCode] = { name: `${p.firstName} ${p.lastName}`, id: p.id };
    }

    const topPartners = Object.entries(partnerCommMap)
      .sort(([, a], [, b]) => b.commission - a.commission)
      .slice(0, 10)
      .map(([code, data]) => ({
        name: partnerInfoMap[code]?.name || code,
        id: partnerInfoMap[code]?.id || null,
        code,
        deals: data.dealIds.size,
        pipeline: data.pipeline,
        commission: data.commission,
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
