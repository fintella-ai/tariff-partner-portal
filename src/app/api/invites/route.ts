import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_COMMISSION_RATE, getAllowedDownlineRates } from "@/lib/constants";
import crypto from "crypto";

function generateToken(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, URL-safe
}

/**
 * GET /api/invites
 * Returns all recruitment invites for the current partner.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const partner = await prisma.partner.findUnique({ where: { partnerCode } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    const invites = await prisma.recruitmentInvite.findMany({
      where: { inviterCode: partnerCode },
      orderBy: { createdAt: "desc" },
    });

    // Check global L3 setting. An L2 can recruit L3 if EITHER the
    // portal-wide flag is on OR this specific partner has their
    // per-partner Partner.l3Enabled flag flipped (admin-granted
    // override). Without the per-partner path, older partners who were
    // manually enabled for L3 recruiting wouldn't see invite links
    // because the global toggle was still off.
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    const globalL3 = settings?.l3Enabled || false;
    const partnerL3 = partner.l3Enabled || false;
    const effectiveL3 = globalL3 || partnerL3;

    return NextResponse.json({
      invites,
      partner: {
        tier: partner.tier,
        commissionRate: partner.commissionRate,
        allowedDownlineRates: getAllowedDownlineRates(partner.commissionRate),
      },
      l3Enabled: effectiveL3,
      maxRate: MAX_COMMISSION_RATE,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch invites" }, { status: 500 });
  }
}

/**
 * POST /api/invites
 * Create a new recruitment invite with a pre-set commission rate.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const body = await req.json();
    const rate = parseFloat(body.rate);

    const partner = await prisma.partner.findUnique({ where: { partnerCode } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    // Determine target tier and validate rate
    // Rate must be in [0.05 … partner.commissionRate - 0.05] in 5% steps
    let targetTier: string;
    const allowedRates = getAllowedDownlineRates(partner.commissionRate);

    if (partner.tier === "l1") {
      targetTier = "l2";
      if (allowedRates.length === 0) {
        return NextResponse.json({ error: "Your commission rate is too low to recruit partners" }, { status: 403 });
      }
      if (!allowedRates.some((r) => Math.abs(r - rate) < 0.001)) {
        return NextResponse.json({ error: `Invalid L2 rate. Allowed: ${allowedRates.map((r) => `${Math.round(r * 100)}%`).join(", ")}` }, { status: 400 });
      }
    } else if (partner.tier === "l2") {
      // L2 → L3 gate: global OR per-partner Partner.l3Enabled can
      // unlock. Mirrors the GET response's effectiveL3 computation so
      // an admin granting the per-partner override unblocks both
      // reading invite rows AND creating new ones.
      const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
      const effectiveL3 = (settings?.l3Enabled || false) || (partner.l3Enabled || false);
      if (!effectiveL3) {
        return NextResponse.json({ error: "L3 recruitment is not enabled" }, { status: 403 });
      }
      if (allowedRates.length === 0) {
        return NextResponse.json({ error: "Your commission rate is too low to recruit L3 partners (minimum 10% required)" }, { status: 403 });
      }
      targetTier = "l3";
      if (!allowedRates.some((r) => Math.abs(r - rate) < 0.001)) {
        return NextResponse.json({ error: `Invalid L3 rate. Allowed: ${allowedRates.map((r) => `${Math.round(r * 100)}%`).join(", ")}` }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "L3 partners cannot recruit" }, { status: 403 });
    }

    const token = generateToken();

    const invite = await prisma.recruitmentInvite.create({
      data: {
        token,
        inviterCode: partnerCode,
        targetTier,
        commissionRate: rate,
        status: "active",
      },
    });

    return NextResponse.json({
      invite,
      signupUrl: `${process.env.NEXTAUTH_URL || "https://fintella.partners"}/signup?token=${token}`,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
