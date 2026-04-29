import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/deals
 * Returns all deals with optional filters.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const where: any = {};

    const stage = req.nextUrl.searchParams.get("stage");
    if (stage && stage !== "all") where.stage = stage;

    const partner = req.nextUrl.searchParams.get("partner");
    if (partner) where.partnerCode = partner;

    const search = req.nextUrl.searchParams.get("search");
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { dealName: { contains: search } },
        { clientName: { contains: search } },
        { clientEmail: { contains: search } },
        { partnerCode: { contains: search.toUpperCase() } },
      ];
    }

    const deals = await prisma.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Get all partners for name resolution AND for the per-row Commission %
    // column on the admin deals table. The submitting partner's commissionRate
    // is the rate they earn on their own direct deals (and the L1 row of the
    // table treats every deal as a direct deal — overrides for L2/L3 deals
    // are handled separately in /admin/payouts EP calculations).
    const partners = await prisma.partner.findMany({
      select: {
        id: true,
        partnerCode: true,
        firstName: true,
        lastName: true,
        commissionRate: true,
        tier: true,
      },
    });
    const partnerMap: Record<string, { name: string; id: string; commissionRate: number; tier: string }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = {
        name: `${p.firstName} ${p.lastName}`,
        id: p.id,
        commissionRate: p.commissionRate,
        tier: p.tier,
      };
    }

    const dealsWithPartnerNames = deals.map((d) => ({
      ...d,
      partnerName: partnerMap[d.partnerCode]?.name || d.partnerCode,
      partnerId: partnerMap[d.partnerCode]?.id || null,
      // Per-deal effective commission rate: prefer the value stored on the
      // Deal row (set when a custom rate was negotiated), else fall back to
      // the submitting partner's standard commissionRate. Returned as a
      // resolved field so the page doesn't have to maintain its own join
      // map between deals and partners.
      effectiveCommissionRate:
        d.l1CommissionRate ??
        partnerMap[d.partnerCode]?.commissionRate ??
        null,
    }));

    // Summary stats
    const allDeals = await prisma.deal.findMany();
    const stats = {
      totalDeals: allDeals.length,
      totalRefundPipeline: allDeals.reduce((s, d) => s + d.estimatedRefundAmount, 0),
      totalFirmFees: allDeals.reduce((s, d) => s + d.firmFeeAmount, 0),
      totalCommissions: allDeals.reduce((s, d) => s + d.l1CommissionAmount + d.l2CommissionAmount + d.l3CommissionAmount, 0),
      byStage: allDeals.reduce<Record<string, number>>((acc, d) => {
        acc[d.stage] = (acc[d.stage] || 0) + 1;
        return acc;
      }, {}),
    };

    return NextResponse.json({ deals: dealsWithPartnerNames, stats, partners });
  } catch {
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
