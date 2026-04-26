import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getL1CommissionRateSnapshot } from "@/lib/commission";
import { recordActivity } from "@/lib/engagement";

/**
 * GET /api/deals
 * Returns the current partner's direct deals, downline partners, and downline deals.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    // The current partner — we need their commissionRate + tier to render
    // the Commission % column on the deals table (the partner is the L1 on
    // their own direct deals, so their own rate is what they earn). Also
    // useful as a top-level field for the page header.
    const me = await prisma.partner.findUnique({
      where: { partnerCode },
      select: { partnerCode: true, tier: true, commissionRate: true },
    });

    // Direct deals
    const directDeals = await prisma.deal.findMany({
      where: { partnerCode },
      orderBy: { createdAt: "desc" },
    });

    // Downline partners
    const downlinePartners = await prisma.partner.findMany({
      where: { referredByPartnerCode: partnerCode },
      orderBy: { createdAt: "desc" },
    });

    // Downline deals (deals from partners this user recruited)
    const downlineCodes = downlinePartners.map((p) => p.partnerCode);
    const downlineDeals = downlineCodes.length > 0
      ? await prisma.deal.findMany({
          where: { partnerCode: { in: downlineCodes } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // Attach partner name to each downline deal
    const partnerMap: Record<string, string> = {};
    for (const p of downlinePartners) {
      partnerMap[p.partnerCode] = `${p.firstName} ${p.lastName}`;
    }
    const downlineDealsWithNames = downlineDeals.map((d) => ({
      ...d,
      submittingPartnerName: partnerMap[d.partnerCode] || d.partnerCode,
    }));

    // L3 downline (partners recruited by L2 partners)
    const l3Partners = downlineCodes.length > 0
      ? await prisma.partner.findMany({
          where: { referredByPartnerCode: { in: downlineCodes } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    return NextResponse.json({
      me,
      directDeals,
      downlinePartners,
      downlineDeals: downlineDealsWithNames,
      l3Partners,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}

/**
 * POST /api/deals
 * Partner submits a new lead/deal.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const body = await req.json();

    // Snapshot the L1 commission rate at deal-creation time so later
    // changes to Partner.commissionRate don't retro-affect this deal.
    const l1RateSnapshot = await getL1CommissionRateSnapshot(
      prisma,
      partnerCode
    ).catch(() => null);

    const deal = await prisma.deal.create({
      data: {
        dealName: body.businessName || body.dealName,
        partnerCode,
        clientName: body.businessName || body.clientName || null,
        clientEmail: body.email || body.clientEmail || null,
        clientPhone: body.phone || body.clientPhone || null,
        stage: "new_lead",
        productType: body.productType || null,
        importedProducts: body.importedProducts || null,
        estimatedRefundAmount: body.estimatedAnnualImportValue ? parseFloat(body.estimatedAnnualImportValue) : 0,
        l1CommissionRate: l1RateSnapshot,
        notes: body.notes || null,
      },
    });

    recordActivity(partnerCode, "deal_submitted", { dealId: deal.id }).catch(() => {});

    return NextResponse.json({ deal }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to submit lead" }, { status: 500 });
  }
}
