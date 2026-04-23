import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/partner/enterprise
 *
 * Partner-facing mirror of /api/admin/enterprise. If the calling partner
 * has an active EnterprisePartner record, returns their override rate,
 * coverage list, per-deal breakdown, and totals. Otherwise returns
 * `{ isEnterprise: false }` — lets the Reporting page hide the EP UI
 * for non-EP partners without leaking EP data structures.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const ep = await prisma.enterprisePartner.findUnique({
      where: { partnerCode },
      include: { overrides: true },
    });

    if (!ep || ep.status !== "active") {
      return NextResponse.json({ isEnterprise: false });
    }

    const activeOverrides = ep.overrides.filter((o) => o.status === "active");
    const l1Codes = activeOverrides.map((o) => o.l1PartnerCode);

    // Scope the deal set: applyToAll → every deal in the portal except the
    // EP's own (the EP shouldn't collect an override on their own direct
    // deals); otherwise only deals from the assigned L1 partner codes.
    const deals = ep.applyToAll
      ? await prisma.deal.findMany({
          where: { partnerCode: { not: partnerCode } },
          orderBy: { createdAt: "desc" },
        })
      : l1Codes.length > 0
        ? await prisma.deal.findMany({
            where: { partnerCode: { in: l1Codes } },
            orderBy: { createdAt: "desc" },
          })
        : [];

    const involvedCodes = Array.from(
      new Set([ep.partnerCode, ...l1Codes, ...deals.map((d) => d.partnerCode)])
    );
    const partners = await prisma.partner.findMany({
      where: { partnerCode: { in: involvedCodes } },
      select: { partnerCode: true, firstName: true, lastName: true, companyName: true },
    });
    const partnerMap: Record<string, { name: string; company: string | null }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = {
        name: `${p.firstName} ${p.lastName}`.trim(),
        company: p.companyName,
      };
    }

    let totalOverrideEarnings = 0;
    const dealBreakdown = deals.map((d) => {
      const firmFee = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0);
      const overrideAmount = firmFee * ep.overrideRate;
      totalOverrideEarnings += overrideAmount;

      // EP override lifecycle mirrors L1/L2/L3 ledger rows, minus the
      // batched "paid" transition (that lives on PayoutBatchItem which we
      // don't query here). closed_lost contributes nothing; closed_won
      // flips to `due` once Frost has paid Fintella; everything else is
      // `pending`.
      const status = d.stage === "closedlost"
        ? "pending"
        : d.stage === "closedwon"
          ? (d.paymentReceivedAt ? "due" : "pending")
          : "pending";

      return {
        id: d.id,
        dealName: d.dealName,
        createdAt: d.createdAt,
        l1PartnerCode: d.partnerCode,
        l1PartnerName: partnerMap[d.partnerCode]?.company || partnerMap[d.partnerCode]?.name || d.partnerCode,
        stage: d.stage,
        estimatedRefundAmount: d.estimatedRefundAmount,
        firmFeeRate: d.firmFeeRate,
        firmFeeAmount: firmFee,
        overrideAmount,
        status,
      };
    });

    const coveredPartners = ep.applyToAll
      ? []
      : activeOverrides.map((o) => ({
          partnerCode: o.l1PartnerCode,
          name: partnerMap[o.l1PartnerCode]?.company || partnerMap[o.l1PartnerCode]?.name || o.l1PartnerCode,
          dealCount: deals.filter((d) => d.partnerCode === o.l1PartnerCode).length,
        }));

    return NextResponse.json({
      isEnterprise: true,
      overrideRate: ep.overrideRate,
      applyToAll: ep.applyToAll,
      coveredPartners,
      coveredCount: ep.applyToAll ? null : activeOverrides.length,
      totalOverrideEarnings,
      totalDeals: deals.length,
      deals: dealBreakdown,
    });
  } catch (e) {
    console.error("Partner enterprise GET error:", e);
    return NextResponse.json({ error: "Failed to fetch enterprise data" }, { status: 500 });
  }
}
