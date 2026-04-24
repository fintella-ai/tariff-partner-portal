import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";

function generatePartnerCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PTN";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * GET /api/admin/partners
 * List all partners with optional search.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const search = req.nextUrl.searchParams.get("search") || "";

    let partners;
    if (search) {
      partners = await prisma.partner.findMany({
        where: {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { email: { contains: search } },
            { partnerCode: { contains: search.toUpperCase() } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      partners = await prisma.partner.findMany({ orderBy: { createdAt: "desc" } });
    }

    // Fetch agreement, W9, profile, stripe, deal counts, downline counts in parallel.
    const partnerCodes = partners.map((p: any) => p.partnerCode);

    const [agreements, w9Docs, profiles, stripeAccounts, dealCounts, downlineCounts, inviteCounts] = await Promise.all([
      prisma.partnershipAgreement.findMany({
        where: { partnerCode: { in: partnerCodes } },
        orderBy: { version: "desc" },
        distinct: ["partnerCode"],
        select: { partnerCode: true, status: true },
      }),
      prisma.document.findMany({
        where: { partnerCode: { in: partnerCodes }, docType: "w9" },
        orderBy: { createdAt: "desc" },
        distinct: ["partnerCode"],
        select: { partnerCode: true, status: true },
      }),
      prisma.partnerProfile.findMany({
        where: { partnerCode: { in: partnerCodes } },
        select: {
          partnerCode: true, street: true, city: true, state: true, zip: true,
          payoutMethod: true, bankName: true, accountNumber: true, routingNumber: true, paypalEmail: true,
        },
      }),
      prisma.stripeAccount.findMany({
        where: { partnerCode: { in: partnerCodes } },
        select: { partnerCode: true, status: true },
      }).catch(() => [] as { partnerCode: string; status: string }[]),
      prisma.deal.groupBy({
        by: ["partnerCode"],
        where: { partnerCode: { in: partnerCodes } },
        _count: { _all: true },
      }).catch(() => [] as { partnerCode: string; _count: { _all: number } }[]),
      prisma.partner.groupBy({
        by: ["referredByPartnerCode"],
        where: { referredByPartnerCode: { in: partnerCodes } },
        _count: { _all: true },
      }),
      prisma.recruitmentInvite.groupBy({
        by: ["inviterCode"],
        where: { inviterCode: { in: partnerCodes } },
        _count: { _all: true },
      }),
    ]);

    const agreementMap: Record<string, string> = {};
    agreements.forEach((a) => { agreementMap[a.partnerCode] = a.status; });
    const w9Map: Record<string, string> = {};
    w9Docs.forEach((d) => { w9Map[d.partnerCode] = d.status; });
    const profileMap: Record<string, (typeof profiles)[number]> = {};
    profiles.forEach((p) => { profileMap[p.partnerCode] = p; });
    const stripeMap: Record<string, string> = {};
    stripeAccounts.forEach((s: { partnerCode: string; status: string }) => { stripeMap[s.partnerCode] = s.status; });
    const dealCountMap: Record<string, number> = {};
    dealCounts.forEach((d: { partnerCode: string; _count: { _all: number } }) => { dealCountMap[d.partnerCode] = d._count._all; });
    const downlineCountMap: Record<string, number> = {};
    downlineCounts.forEach((d) => { if (d.referredByPartnerCode) downlineCountMap[d.referredByPartnerCode] = d._count._all; });
    const inviteCountMap: Record<string, number> = {};
    inviteCounts.forEach((i) => { if (i.inviterCode) inviteCountMap[i.inviterCode] = i._count._all; });

    const STALL_THRESHOLD_DAYS = 7;
    const now = Date.now();

    const enriched = partners.map((p: any) => {
      let state: Record<string, unknown> = {};
      try { state = JSON.parse(p.onboardingState || "{}"); if (typeof state !== "object" || !state) state = {}; } catch { state = {}; }

      const profile = profileMap[p.partnerCode];
      const stripeStatus = stripeMap[p.partnerCode];
      const agreementSigned = p.status === "active" || agreementMap[p.partnerCode] === "signed" || agreementMap[p.partnerCode] === "amended";
      const profileComplete = !!(profile?.street && profile?.city && profile?.state && profile?.zip);
      const payoutComplete = stripeStatus === "active" || (
        profile?.payoutMethod === "check" ? true :
        profile?.payoutMethod === "paypal" ? !!profile?.paypalEmail :
        (profile?.payoutMethod === "wire" || profile?.payoutMethod === "ach") ? !!(profile?.bankName && profile?.accountNumber && profile?.routingNumber) :
        false
      );
      const videoWatched = !!state.watchedWelcomeVideoAt;
      const callJoined = !!state.firstCallJoinedAt;
      const trainingDone = !!state.firstTrainingCompletedAt;
      const linkShared = !!state.referralLinkSharedAt;
      const hasDeal = (dealCountMap[p.partnerCode] || 0) > 0;
      const hasDownline = (downlineCountMap[p.partnerCode] || 0) > 0 || (inviteCountMap[p.partnerCode] || 0) > 0;

      const onboardingCompleted =
        Number(agreementSigned) + Number(profileComplete) + Number(payoutComplete) +
        Number(videoWatched) + Number(callJoined) + Number(trainingDone) +
        Number(linkShared) + Number(hasDeal) + Number(hasDownline);
      const onboardingTotal = 9;
      const onboardingPercent = Math.round((onboardingCompleted / onboardingTotal) * 100);
      const daysSinceSignup = Math.floor((now - new Date(p.signupDate || p.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const onboardingStalled = onboardingCompleted < onboardingTotal && daysSinceSignup >= STALL_THRESHOLD_DAYS && !state.dismissed;

      return {
        ...p,
        agreementStatus: agreementMap[p.partnerCode] || "none",
        w9Status: w9Map[p.partnerCode] || "needed",
        onboardingCompleted,
        onboardingTotal,
        onboardingPercent,
        onboardingStalled,
        onboardingDaysSinceSignup: daysSinceSignup,
      };
    });

    return NextResponse.json({ partners: enriched });
  } catch {
    return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 });
  }
}

/**
 * POST /api/admin/partners
 * Create a new partner.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();

    const partnerCode = body.partnerCode?.trim().toUpperCase() || generatePartnerCode();

    // Check for duplicate code or email
    const existing = await prisma.partner.findFirst({
      where: { OR: [{ partnerCode }, { email: body.email }] },
    });
    if (existing) {
      return NextResponse.json(
        { error: existing.partnerCode === partnerCode ? "Partner code already exists" : "Email already registered" },
        { status: 400 }
      );
    }

    const rawFlag = body.payoutDownlineEnabled === true;
    const tierLower = String(body.tier || "").toLowerCase();
    const payoutDownlineEnabled = rawFlag && tierLower === "l1";
    if (payoutDownlineEnabled && role === "accounting") {
      return NextResponse.json({ error: "accounting role cannot enable Payout Downline Partners" }, { status: 403 });
    }

    // Tier + commission rate. Accept optional body fields; fall back to L1 @ 25%
    // (Prisma defaults) if the admin didn't pass them. Custom rates are allowed
    // in (0, 0.50] — same envelope as the L1 invite flow.
    const tier = (typeof body.tier === "string" && ["l1", "l2", "l3"].includes(body.tier))
      ? body.tier
      : "l1";

    // Structural rule: L2 / L3 partners must always have an upline
    // (referredByPartnerCode). L1s must never have one. The admin form
    // allows the tier override for corrections, but the chain
    // invariant stays enforced at the server so a mis-filled form
    // can't produce an orphan L2 or a rootless L3.
    if (tier === "l1" && body.referredByPartnerCode) {
      return NextResponse.json(
        { error: "L1 partners cannot have an upline (referredByPartnerCode). Leave it blank or pick tier L2/L3." },
        { status: 400 },
      );
    }
    if ((tier === "l2" || tier === "l3") && !body.referredByPartnerCode) {
      return NextResponse.json(
        { error: `${tier.toUpperCase()} partners must have an upline. Provide a 'referredByPartnerCode' or change tier to L1.` },
        { status: 400 },
      );
    }
    let commissionRate: number | undefined = undefined;
    if (body.commissionRate != null) {
      const r = parseFloat(body.commissionRate);
      if (!isFinite(r) || r <= 0 || r > 0.3) {
        return NextResponse.json(
          { error: "Commission rate must be between 1% and 30%." },
          { status: 400 }
        );
      }
      commissionRate = r;
    }

    // Default status for admin-created partners:
    // - Explicit body.status always wins (admin chose a specific value).
    // - No upline (top-level L1) → "active" (admin onboards direct relationships).
    // - Upline has payoutDownlineEnabled=true → "active" (Fintella handles the
    //   waterfall payout, so the downline signs Fintella's standard agreement
    //   via the normal SignWell flow — no external upload needed).
    // - Otherwise → "pending" so the upline L1 can upload the private
    //   L1↔downline agreement from /dashboard/downline before the downline
    //   partner is activated.
    let defaultStatus = "active";
    if (body.referredByPartnerCode) {
      const upline = await prisma.partner.findUnique({
        where: { partnerCode: body.referredByPartnerCode },
        select: { payoutDownlineEnabled: true },
      });
      if (!upline?.payoutDownlineEnabled) defaultStatus = "pending";
    }

    const partner = await prisma.partner.create({
      data: {
        partnerCode,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: normalizePhone(body.phone),
        status: body.status || defaultStatus,
        referredByPartnerCode: body.referredByPartnerCode || null,
        l3Enabled: body.l3Enabled || false,
        notes: body.notes || null,
        tier,
        payoutDownlineEnabled,
        ...(commissionRate !== undefined && { commissionRate }),
      },
    });

    return NextResponse.json({ partner }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create partner" }, { status: 500 });
  }
}
