import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/settings
 * Returns all portal settings for admin editing.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    let settings = await prisma.portalSettings.findUnique({
      where: { id: "global" },
    });

    if (!settings) {
      settings = await prisma.portalSettings.create({
        data: { id: "global" },
      });
    }

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/settings
 * Update portal settings. Accepts partial updates.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data: Record<string, any> = {};

    // Branding
    if (body.firmName !== undefined) data.firmName = body.firmName;
    if (body.firmShort !== undefined) data.firmShort = body.firmShort;
    if (body.firmSlogan !== undefined) data.firmSlogan = body.firmSlogan;
    if (body.firmPhone !== undefined) data.firmPhone = body.firmPhone;
    if (body.supportEmail !== undefined) data.supportEmail = body.supportEmail;
    if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl;
    if (body.faviconUrl !== undefined) data.faviconUrl = body.faviconUrl;
    if (body.agreementTemplate25 !== undefined) data.agreementTemplate25 = body.agreementTemplate25;
    if (body.agreementTemplate20 !== undefined) data.agreementTemplate20 = body.agreementTemplate20;
    if (body.agreementTemplate15 !== undefined) data.agreementTemplate15 = body.agreementTemplate15;
    if (body.agreementTemplate10 !== undefined) data.agreementTemplate10 = body.agreementTemplate10;
    if (body.maxCommissionRate !== undefined) data.maxCommissionRate = parseFloat(body.maxCommissionRate);

    // Commission Rates
    if (body.firmFeeRate !== undefined) data.firmFeeRate = parseFloat(body.firmFeeRate);
    if (body.l1Rate !== undefined) data.l1Rate = parseFloat(body.l1Rate);
    if (body.l2Rate !== undefined) data.l2Rate = parseFloat(body.l2Rate);
    if (body.l3Rate !== undefined) data.l3Rate = parseFloat(body.l3Rate);
    if (body.l3Enabled !== undefined) data.l3Enabled = body.l3Enabled;

    // Navigation
    if (body.hiddenNavItems !== undefined) {
      data.hiddenNavItems = typeof body.hiddenNavItems === "string"
        ? body.hiddenNavItems
        : JSON.stringify(body.hiddenNavItems);
    }
    if (body.navOrder !== undefined) {
      data.navOrder = typeof body.navOrder === "string"
        ? body.navOrder
        : JSON.stringify(body.navOrder);
    }

    // Home page content
    if (body.announcements !== undefined) {
      data.announcements = typeof body.announcements === "string"
        ? body.announcements
        : JSON.stringify(body.announcements);
    }
    if (body.upcomingEvents !== undefined) {
      data.upcomingEvents = typeof body.upcomingEvents === "string"
        ? body.upcomingEvents
        : JSON.stringify(body.upcomingEvents);
    }
    if (body.referralOpportunities !== undefined) {
      data.referralOpportunities = typeof body.referralOpportunities === "string"
        ? body.referralOpportunities
        : JSON.stringify(body.referralOpportunities);
    }
    if (body.leaderboardEnabled !== undefined) data.leaderboardEnabled = body.leaderboardEnabled;

    // Upsert — create if not exists
    const settings = await prisma.portalSettings.upsert({
      where: { id: "global" },
      update: data,
      create: { id: "global", ...data },
    });

    return NextResponse.json({ settings });
  } catch (err: any) {
    console.error("[Settings PUT] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to update settings" }, { status: 500 });
  }
}
