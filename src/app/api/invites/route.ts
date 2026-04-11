import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALLOWED_L2_RATES, ALLOWED_L3_RATES, MAX_COMMISSION_RATE } from "@/lib/constants";
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

    // Check global L3 setting
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });

    return NextResponse.json({
      invites,
      partner: {
        tier: partner.tier,
        commissionRate: partner.commissionRate,
      },
      l3Enabled: settings?.l3Enabled || false,
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
    let targetTier: string;
    if (partner.tier === "l1") {
      targetTier = "l2";
      if (!ALLOWED_L2_RATES.includes(rate)) {
        return NextResponse.json({ error: `Invalid L2 rate. Allowed: ${ALLOWED_L2_RATES.map((r) => `${r * 100}%`).join(", ")}` }, { status: 400 });
      }
    } else if (partner.tier === "l2") {
      // Check if L3 is enabled globally
      const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
      if (!settings?.l3Enabled) {
        return NextResponse.json({ error: "L3 recruitment is not enabled" }, { status: 403 });
      }
      targetTier = "l3";
      if (!ALLOWED_L3_RATES.includes(rate)) {
        return NextResponse.json({ error: `Invalid L3 rate. Allowed: ${ALLOWED_L3_RATES.map((r) => `${r * 100}%`).join(", ")}` }, { status: 400 });
      }
      // L3 rate must be less than L2's own rate
      if (rate >= partner.commissionRate) {
        return NextResponse.json({ error: "L3 rate must be less than your own rate" }, { status: 400 });
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
      signupUrl: `${process.env.NEXTAUTH_URL || "https://trln.partners"}/signup?token=${token}`,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
