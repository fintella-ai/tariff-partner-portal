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

    // Get all partners for name resolution
    const partners = await prisma.partner.findMany({
      select: { id: true, partnerCode: true, firstName: true, lastName: true },
    });
    const partnerMap: Record<string, { name: string; id: string }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = { name: `${p.firstName} ${p.lastName}`, id: p.id };
    }

    const dealsWithPartnerNames = deals.map((d) => ({
      ...d,
      partnerName: partnerMap[d.partnerCode]?.name || d.partnerCode,
      partnerId: partnerMap[d.partnerCode]?.id || null,
    }));

    // Summary stats
    const allDeals = await prisma.deal.findMany();
    const stats = {
      totalDeals: allDeals.length,
      totalRefundPipeline: allDeals.reduce((s, d) => s + d.estimatedRefundAmount, 0),
      totalFirmFees: allDeals.reduce((s, d) => s + d.firmFeeAmount, 0),
      totalCommissions: allDeals.reduce((s, d) => s + d.l1CommissionAmount + d.l2CommissionAmount, 0),
      byStage: {
        new_lead: allDeals.filter((d) => d.stage === "new_lead").length,
        no_consultation: allDeals.filter((d) => d.stage === "no_consultation").length,
        consultation_booked: allDeals.filter((d) => d.stage === "consultation_booked").length,
        client_no_show: allDeals.filter((d) => d.stage === "client_no_show").length,
        client_engaged: allDeals.filter((d) => d.stage === "client_engaged").length,
        in_process: allDeals.filter((d) => d.stage === "in_process").length,
        closedwon: allDeals.filter((d) => d.stage === "closedwon").length,
        closedlost: allDeals.filter((d) => d.stage === "closedlost").length,
      },
    };

    return NextResponse.json({ deals: dealsWithPartnerNames, stats, partners });
  } catch {
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
