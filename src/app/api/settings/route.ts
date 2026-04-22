import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Opt out of any static optimization / route-level caching. Partners load
// this on every dashboard mount to pick up the latest nav order, labels,
// icons, and hidden items. Caching here would delay admin-side changes
// reaching partners by minutes-to-hours, which is the bug John reported
// ("how long does it take to change after save?"). Should be ~instant.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    return NextResponse.json({ settings }, {
      headers: {
        // Explicit no-store so browser + any intermediary proxies (Vercel
        // edge, CDN, etc.) don't serve a stale snapshot after an admin save.
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch {
    // Return hardcoded defaults if DB not available
    return NextResponse.json({
      settings: {
        id: "global",
        firmName: "Financial Intelligence Network",
        firmShort: "Fintella",
        firmSlogan: "Fighting for what's owed, reclaiming what's fair.",
        firmPhone: "(410) 497-5947",
        supportEmail: "",
        logoUrl: "",
        faviconUrl: "",
        firmFeeRate: 0.20,
        maxCommissionRate: 0.25,
        l1Rate: 0.25,
        l2Rate: 0.05,
        l3Rate: 0,
        l3Enabled: false,
        agreementTemplate25: "",
        agreementTemplate20: "",
        agreementTemplate15: "",
        agreementTemplate10: "",
        hiddenNavItems: "[]",
        navOrder: "[]",
        navLabels: "{}",
        navIcons: "{}",
        announcements: "[]",
        upcomingEvents: "[]",
        referralOpportunities: "[]",
        leaderboardEnabled: true,
      },
    });
  }
}
