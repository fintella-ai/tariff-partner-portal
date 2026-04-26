import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_COMMISSION_RATE, getAllowedDownlineRates } from "@/lib/constants";
import crypto from "crypto";
import { recordActivity } from "@/lib/engagement";

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

    // Option B Phase 6: the L3 gate is gone. Any partner whose rate
    // leaves room below them (Phase 2 validation) can recruit — no
    // per-partner `Partner.l3Enabled` or portal-level
    // `PortalSettings.l3Enabled` toggle consulted. We still emit
    // `l3Enabled: true` on the GET so any cached partner-side client
    // that was reading the field sees a permissive value; the field
    // will be dropped from the response entirely once all clients
    // stop reading it.
    return NextResponse.json({
      invites,
      partner: {
        tier: partner.tier,
        commissionRate: partner.commissionRate,
        allowedDownlineRates: getAllowedDownlineRates(partner.commissionRate),
      },
      l3Enabled: true,
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

    // Rate validation (Option B Phase 2):
    //   - Free-form number, no multiple-of-5 requirement
    //   - Must be strictly less than the inviter's own rate
    //   - Must be a positive finite number (> 0)
    // The old step-of-5% ladder is gone. Partners can now offer any rate
    // below their own — e.g. L1 @ 25% can invite at 12.5% or 7.75%.
    if (!isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "Rate must be a positive number" }, { status: 400 });
    }
    if (rate >= partner.commissionRate) {
      return NextResponse.json(
        { error: `Rate must be less than your own rate (${Math.round(partner.commissionRate * 100)}%)` },
        { status: 400 },
      );
    }

    // Depth gate: L1 → L2, L2 → L3. L3 cannot recruit yet because the
    // legacy commission math + reporting labels only handle 3 tiers.
    // This opens up in a later phase once the schema + commission path
    // fully support depth >3 (Phase 5 of Option B).
    let targetTier: string;
    if (partner.tier === "l1") {
      targetTier = "l2";
    } else if (partner.tier === "l2") {
      targetTier = "l3";
    } else {
      return NextResponse.json({ error: "L3 partners cannot recruit yet — deeper chains open in a later release" }, { status: 403 });
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

    recordActivity(partnerCode, "link_shared", { linkId: invite.id }).catch(() => {});

    return NextResponse.json({
      invite,
      signupUrl: `${process.env.NEXTAUTH_URL || "https://fintella.partners"}/signup?token=${token}`,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
