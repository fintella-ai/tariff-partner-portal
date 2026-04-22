import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Walk up from a non-L1 partner to find the top-of-chain L1 and its flag. */
async function resolveTopL1(
  tier: string,
  referredByPartnerCode: string | null
): Promise<{ partnerCode: string; payoutDownlineEnabled: boolean } | null> {
  if (tier === "l1" || !referredByPartnerCode) return null;

  // For L2: direct parent should be L1
  const parent = await prisma.partner.findUnique({
    where: { partnerCode: referredByPartnerCode },
    select: { partnerCode: true, tier: true, payoutDownlineEnabled: true, referredByPartnerCode: true },
  });
  if (!parent) return null;
  if (parent.tier === "l1") return { partnerCode: parent.partnerCode, payoutDownlineEnabled: parent.payoutDownlineEnabled };

  // For L3: parent is L2, need to go one more level up
  if (!parent.referredByPartnerCode) return null;
  const grandparent = await prisma.partner.findUnique({
    where: { partnerCode: parent.referredByPartnerCode },
    select: { partnerCode: true, tier: true, payoutDownlineEnabled: true },
  });
  if (grandparent?.tier === "l1") return { partnerCode: grandparent.partnerCode, payoutDownlineEnabled: grandparent.payoutDownlineEnabled };

  return null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    // Fetch partner's commission tier and rate — these drive the waterfall
    const partner = await prisma.partner.findUnique({
      where: { partnerCode },
      select: { tier: true, commissionRate: true, l3Enabled: true, payoutDownlineEnabled: true, referredByPartnerCode: true },
    });

    // Fetch commission ledger entries
    const ledger = await prisma.commissionLedger.findMany({
      where: { partnerCode },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Resolve the top-of-chain L1's flag (for L2/L3 "paid by upline" note)
    const topL1 = partner
      ? await resolveTopL1(partner.tier, partner.referredByPartnerCode)
      : null;

    // For L1s: fetch downline deals for the Downline Accounting subsection
    let downlineDeals: Array<{
      dealId: string;
      dealName: string;
      firmFeeAmount: number;
      submitterPartnerCode: string;
      submitterPartnerName: string;
      submitterTier: string;
      submitterRate: number;
      l1CommissionAmount: number;
      l2CommissionAmount: number;
    }> = [];

    if (partner?.tier === "l1") {
      const directDownline = await prisma.partner.findMany({
        where: { referredByPartnerCode: partnerCode },
        select: { partnerCode: true, tier: true, commissionRate: true, firstName: true, lastName: true, referredByPartnerCode: true },
      });
      const l2Codes = directDownline.filter((p) => p.tier === "l2").map((p) => p.partnerCode);
      const l3Downline = l2Codes.length > 0
        ? await prisma.partner.findMany({
            where: { referredByPartnerCode: { in: l2Codes } },
            select: { partnerCode: true, tier: true, commissionRate: true, firstName: true, lastName: true, referredByPartnerCode: true },
          })
        : [];
      const allDownlinePartners = [...directDownline, ...l3Downline];
      const allDownlineCodes = allDownlinePartners.map((p) => p.partnerCode);

      if (allDownlineCodes.length > 0) {
        const deals = await prisma.deal.findMany({
          where: { partnerCode: { in: allDownlineCodes }, stage: "closedwon" },
          select: {
            id: true, dealName: true, firmFeeAmount: true, partnerCode: true,
            l1CommissionAmount: true, l2CommissionAmount: true,
          },
        });
        const byCode = Object.fromEntries(allDownlinePartners.map((p) => [p.partnerCode, p]));
        downlineDeals = deals.map((d) => {
          const submitter = byCode[d.partnerCode];
          return {
            dealId: d.id,
            dealName: d.dealName ?? "",
            firmFeeAmount: d.firmFeeAmount ?? 0,
            submitterPartnerCode: d.partnerCode ?? "",
            submitterPartnerName: submitter ? `${submitter.firstName} ${submitter.lastName}`.trim() : (d.partnerCode ?? ""),
            submitterTier: submitter?.tier ?? "unknown",
            submitterRate: submitter?.commissionRate ?? 0,
            l1CommissionAmount: d.l1CommissionAmount ?? 0,
            l2CommissionAmount: d.l2CommissionAmount ?? 0,
          };
        });
      }
    }

    return NextResponse.json({
      tier: partner?.tier ?? "l1",
      commissionRate: partner?.commissionRate ?? 0.25,
      l3Enabled: partner?.l3Enabled ?? false,
      payoutDownlineEnabled: partner?.payoutDownlineEnabled ?? false,
      topL1PayoutDownlineEnabled: topL1?.payoutDownlineEnabled ?? null,
      ledger,
      downlineDeals,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch commissions" }, { status: 500 });
  }
}
