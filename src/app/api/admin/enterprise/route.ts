import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/enterprise
 * Returns all enterprise partners with their overrides, assigned L1 partners,
 * and deal-level reporting data.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const enterprises = await prisma.enterprisePartner.findMany({
      include: { overrides: true },
      orderBy: { createdAt: "desc" },
    });

    // Get partner names for all involved partner codes
    const allCodes = new Set<string>();
    for (const ep of enterprises) {
      allCodes.add(ep.partnerCode);
      for (const ov of ep.overrides) {
        allCodes.add(ov.l1PartnerCode);
      }
    }

    const partners = await prisma.partner.findMany({
      where: { partnerCode: { in: Array.from(allCodes) } },
      select: { id: true, partnerCode: true, firstName: true, lastName: true, companyName: true, status: true },
    });
    const partnerMap: Record<string, { id: string; name: string; company: string | null; status: string }> = {};
    for (const p of partners) {
      partnerMap[p.partnerCode] = {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        company: p.companyName,
        status: p.status,
      };
    }

    // For reporting: get deals
    // If any enterprise has applyToAll, we need ALL deals
    const hasApplyToAll = enterprises.some((ep) => ep.applyToAll && ep.status === "active");

    const allL1Codes = new Set<string>();
    for (const ep of enterprises) {
      if (!ep.applyToAll) {
        for (const ov of ep.overrides) {
          if (ov.status === "active") allL1Codes.add(ov.l1PartnerCode);
        }
      }
    }

    const allDeals = await prisma.deal.findMany();
    const specificDeals = hasApplyToAll ? allDeals : (
      allL1Codes.size > 0
        ? allDeals.filter((d) => allL1Codes.has(d.partnerCode))
        : []
    );

    // Build enriched response
    const enriched = enterprises.map((ep) => {
      const activeOverrides = ep.overrides.filter((o) => o.status === "active");
      const l1Codes = activeOverrides.map((o) => o.l1PartnerCode);

      // If applyToAll, include all deals except the EP's own deals
      const epDeals = ep.applyToAll
        ? allDeals.filter((d) => d.partnerCode !== ep.partnerCode)
        : specificDeals.filter((d) => l1Codes.includes(d.partnerCode));

      // Calculate enterprise override earnings
      const FIRM_FEE_RATE = 0.40; // TRLN 40%
      let totalOverrideEarnings = 0;
      let totalFirmFees = 0;
      let totalDealAmount = 0;

      const dealBreakdown = epDeals.map((d) => {
        const firmFee = d.firmFeeAmount || d.estimatedRefundAmount * (d.firmFeeRate || 0.20);
        const overrideAmount = firmFee * ep.overrideRate;
        const trlnGross = firmFee * FIRM_FEE_RATE;
        const l1Commission = d.l1CommissionAmount + d.l2CommissionAmount;
        const trlnNetAfterEnterprise = trlnGross - l1Commission - overrideAmount;

        totalOverrideEarnings += overrideAmount;
        totalFirmFees += firmFee;
        totalDealAmount += d.estimatedRefundAmount;

        return {
          id: d.id,
          dealName: d.dealName,
          partnerCode: d.partnerCode,
          partnerName: partnerMap[d.partnerCode]?.name || d.partnerCode,
          stage: d.stage,
          dealAmount: d.estimatedRefundAmount,
          firmFee,
          trlnGross,
          l1Commission,
          overrideAmount,
          trlnNetAfterEnterprise,
          createdAt: d.createdAt,
        };
      });

      return {
        id: ep.id,
        partnerCode: ep.partnerCode,
        partnerId: partnerMap[ep.partnerCode]?.id || null,
        partnerName: partnerMap[ep.partnerCode]?.name || ep.partnerCode,
        companyName: partnerMap[ep.partnerCode]?.company || null,
        totalRate: ep.totalRate,
        overrideRate: ep.overrideRate,
        applyToAll: ep.applyToAll,
        status: ep.status,
        notes: ep.notes,
        createdAt: ep.createdAt,
        overrides: ep.overrides.map((o) => ({
          id: o.id,
          l1PartnerCode: o.l1PartnerCode,
          l1PartnerId: partnerMap[o.l1PartnerCode]?.id || null,
          l1PartnerName: partnerMap[o.l1PartnerCode]?.name || o.l1PartnerCode,
          l1PartnerStatus: partnerMap[o.l1PartnerCode]?.status || "unknown",
          status: o.status,
          createdAt: o.createdAt,
        })),
        // Reporting summary
        summary: {
          totalDeals: epDeals.length,
          totalDealAmount,
          totalFirmFees,
          totalOverrideEarnings,
          closedWonDeals: epDeals.filter((d) => d.stage === "closedwon").length,
        },
        dealBreakdown,
      };
    });

    return NextResponse.json({ enterprises: enriched });
  } catch (e) {
    console.error("Enterprise GET error:", e);
    return NextResponse.json({ error: "Failed to fetch enterprise partners" }, { status: 500 });
  }
}

/**
 * POST /api/admin/enterprise
 * Create enterprise partner, add/remove L1 overrides, or deactivate.
 * Super admin only.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin")
    return NextResponse.json({ error: "Only super admins can manage enterprise partners" }, { status: 403 });

  try {
    const body = await req.json();

    // ─── Create Enterprise Partner ────────────────────────────────────
    if (body.action === "create") {
      const { partnerCode, totalRate, notes } = body;
      if (!partnerCode || !totalRate) {
        return NextResponse.json({ error: "partnerCode and totalRate are required" }, { status: 400 });
      }

      const rate = parseFloat(totalRate);
      if (rate <= 0.25) {
        return NextResponse.json({ error: "Total rate must be higher than 25% (the standard L1 rate)" }, { status: 400 });
      }

      // Verify partner exists and is active
      const partner = await prisma.partner.findUnique({ where: { partnerCode } });
      if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
      if (partner.status !== "active") {
        return NextResponse.json({ error: "Partner must be active" }, { status: 400 });
      }

      // Check not already enterprise
      const existing = await prisma.enterprisePartner.findUnique({ where: { partnerCode } });
      if (existing) {
        return NextResponse.json({ error: "Partner is already an enterprise partner" }, { status: 400 });
      }

      const ep = await prisma.enterprisePartner.create({
        data: {
          partnerCode,
          totalRate: rate,
          overrideRate: rate - 0.25,
          applyToAll: body.applyToAll === true,
          notes: notes || null,
          createdBy: session.user.email || "admin",
        },
      });

      return NextResponse.json({ enterprise: ep }, { status: 201 });
    }

    // ─── Add L1 Override ──────────────────────────────────────────────
    if (body.action === "add_override") {
      const { enterprisePartnerCode, l1PartnerCode } = body;
      if (!enterprisePartnerCode || !l1PartnerCode) {
        return NextResponse.json({ error: "enterprisePartnerCode and l1PartnerCode are required" }, { status: 400 });
      }

      // Verify enterprise partner exists
      const ep = await prisma.enterprisePartner.findUnique({ where: { partnerCode: enterprisePartnerCode } });
      if (!ep) return NextResponse.json({ error: "Enterprise partner not found" }, { status: 404 });

      // Verify L1 partner exists
      const l1 = await prisma.partner.findUnique({ where: { partnerCode: l1PartnerCode } });
      if (!l1) return NextResponse.json({ error: "L1 partner not found" }, { status: 404 });

      // Can't add self
      if (enterprisePartnerCode === l1PartnerCode) {
        return NextResponse.json({ error: "Cannot assign an enterprise partner under themselves" }, { status: 400 });
      }

      // Check for existing (reactivate if removed)
      const existing = await prisma.enterpriseOverride.findUnique({
        where: { enterprisePartnerCode_l1PartnerCode: { enterprisePartnerCode, l1PartnerCode } },
      });

      if (existing) {
        if (existing.status === "active") {
          return NextResponse.json({ error: "This L1 partner is already assigned" }, { status: 400 });
        }
        // Reactivate
        const updated = await prisma.enterpriseOverride.update({
          where: { id: existing.id },
          data: { status: "active", createdBy: session.user.email || "admin" },
        });
        return NextResponse.json({ override: updated });
      }

      const override = await prisma.enterpriseOverride.create({
        data: {
          enterprisePartnerCode,
          l1PartnerCode,
          createdBy: session.user.email || "admin",
        },
      });

      return NextResponse.json({ override }, { status: 201 });
    }

    // ─── Remove L1 Override ───────────────────────────────────────────
    if (body.action === "remove_override") {
      const { overrideId } = body;
      if (!overrideId) return NextResponse.json({ error: "overrideId is required" }, { status: 400 });

      const override = await prisma.enterpriseOverride.update({
        where: { id: overrideId },
        data: { status: "removed" },
      });

      return NextResponse.json({ override });
    }

    // ─── Update Enterprise Partner ────────────────────────────────────
    if (body.action === "update") {
      const { partnerCode, totalRate, status, notes } = body;
      if (!partnerCode) return NextResponse.json({ error: "partnerCode is required" }, { status: 400 });

      const data: any = {};
      if (totalRate !== undefined) {
        const rate = parseFloat(totalRate);
        if (rate <= 0.25) {
          return NextResponse.json({ error: "Total rate must be higher than 25%" }, { status: 400 });
        }
        data.totalRate = rate;
        data.overrideRate = rate - 0.25;
      }
      if (body.applyToAll !== undefined) data.applyToAll = body.applyToAll;
      if (status !== undefined) data.status = status;
      if (notes !== undefined) data.notes = notes;

      const ep = await prisma.enterprisePartner.update({
        where: { partnerCode },
        data,
      });

      return NextResponse.json({ enterprise: ep });
    }

    // ─── Delete Enterprise Partner (permanent) ─────────────────────────
    if (body.action === "delete") {
      const { partnerCode } = body;
      if (!partnerCode) return NextResponse.json({ error: "partnerCode is required" }, { status: 400 });

      // Delete all overrides first (foreign key constraint)
      await prisma.enterpriseOverride.deleteMany({
        where: { enterprisePartnerCode: partnerCode },
      });

      // Delete the enterprise partner record
      await prisma.enterprisePartner.delete({
        where: { partnerCode },
      });

      return NextResponse.json({ deleted: true, partnerCode });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("Enterprise POST error:", e);
    return NextResponse.json({ error: "Failed to process enterprise action" }, { status: 500 });
  }
}
