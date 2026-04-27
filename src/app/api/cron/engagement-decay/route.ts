import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/engagement-decay
 *
 * Vercel Cron target. Runs daily. Decays engagement scores by 2 points
 * for partners inactive for >24 hours and recalculates their tier.
 *
 * Tier thresholds:
 *   >=80 → hot
 *   >=50 → active
 *   >=20 → cooling
 *   <20  → cold
 */

function tierFromScore(score: number): string {
  if (score >= 80) return "hot";
  if (score >= 50) return "active";
  if (score >= 20) return "cooling";
  return "cold";
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find partners with engagement score > 0 who have been inactive > 24h
  const stale = await prisma.partner.findMany({
    where: {
      engagementScore: { gt: 0 },
      OR: [
        { lastActivityAt: { lt: cutoff } },
        { lastActivityAt: null },
      ],
    },
    select: {
      partnerCode: true,
      engagementScore: true,
    },
  });

  let updated = 0;

  for (const p of stale) {
    const newScore = Math.max(0, p.engagementScore - 2);
    const newTier = tierFromScore(newScore);

    await prisma.partner.update({
      where: { partnerCode: p.partnerCode },
      data: {
        engagementScore: newScore,
        engagementTier: newTier,
      },
    });
    updated++;
  }

  return NextResponse.json({
    ok: true,
    updated,
    checked: stale.length,
    cutoff: cutoff.toISOString(),
  });
}
