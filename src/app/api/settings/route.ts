import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/settings
 * Returns portal settings (public — used by partner portal).
 * No auth required since these are display settings.
 */
export async function GET(req: NextRequest) {
  try {
    let settings = await prisma.portalSettings.findUnique({
      where: { id: "global" },
    });

    // Create defaults if not exists
    if (!settings) {
      settings = await prisma.portalSettings.create({
        data: { id: "global" },
      });
    }

    return NextResponse.json({ settings });
  } catch {
    // Return hardcoded defaults if DB not available
    return NextResponse.json({
      settings: {
        id: "global",
        firmName: "Tariff Refund & Litigation Network",
        firmShort: "TRLN",
        firmSlogan: "Fighting for what's owed, reclaiming what's fair.",
        firmPhone: "(410) 497-5947",
        supportEmail: "",
        firmFeeRate: 0.20,
        l1Rate: 0.20,
        l2Rate: 0.05,
        l3Rate: 0,
        l3Enabled: false,
        hiddenNavItems: "[]",
        announcements: "[]",
        upcomingEvents: "[]",
        referralOpportunities: "[]",
        leaderboardEnabled: true,
      },
    });
  }
}
