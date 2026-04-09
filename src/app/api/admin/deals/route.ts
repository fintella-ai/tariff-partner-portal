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
  if (role !== "admin" && role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const where: any = {};

    const stage = req.nextUrl.searchParams.get("stage");
    if (stage && stage !== "all") where.stage = stage;

    const partner = req.nextUrl.searchParams.get("partner");
    if (partner) where.partnerCode = partner;

    const search = req.nextUrl.searchParams.get("search");
    if (search) {
      where.OR = [
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
      select: { partnerCode: true, firstName: true, lastName: true },
    });
    const partnerMap: Record<string, string> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = `${p.firstName} ${p.lastName}`;
    }

    const dealsWithPartnerNames = deals.map((d) => ({
      ...d,
      partnerName: partnerMap[d.partnerCode] || d.partnerCode,
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
        contacted: allDeals.filter((d) => d.stage === "contacted").length,
        qualified: allDeals.filter((d) => d.stage === "qualified").length,
        consultation_booked: allDeals.filter((d) => d.stage === "consultation_booked").length,
        engaged: allDeals.filter((d) => d.stage === "engaged").length,
        closedwon: allDeals.filter((d) => d.stage === "closedwon").length,
        closedlost: allDeals.filter((d) => d.stage === "closedlost").length,
      },
    };

    return NextResponse.json({ deals: dealsWithPartnerNames, stats, partners });
  } catch {
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
