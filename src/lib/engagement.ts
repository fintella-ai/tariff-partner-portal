import { prisma } from "@/lib/prisma";

const POINTS: Record<string, number> = {
  email_open: 1,
  email_click: 3,
  portal_login: 2,
  deal_submitted: 10,
  training_completed: 5,
  call_attended: 5,
  link_shared: 3,
  downline_recruited: 8,
};

const DECAY_RATE = 1; // points lost per day of inactivity
const TIER_THRESHOLDS = { hot: 80, active: 50, cooling: 20 };

export type EngagementTier = "hot" | "active" | "cooling" | "cold";

export function getTier(score: number): EngagementTier {
  if (score >= TIER_THRESHOLDS.hot) return "hot";
  if (score >= TIER_THRESHOLDS.active) return "active";
  if (score >= TIER_THRESHOLDS.cooling) return "cooling";
  return "cold";
}

export async function recordActivity(
  partnerCode: string,
  action: string,
  metadata?: Record<string, any>
): Promise<void> {
  const points = POINTS[action] || 1;
  try {
    await prisma.partnerActivity.create({
      data: {
        partnerCode,
        action,
        points,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
    await recalculateScore(partnerCode);
  } catch (e) {
    console.error("[engagement] recordActivity failed:", e);
  }
}

export async function recalculateScore(partnerCode: string): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const activities = await prisma.partnerActivity.findMany({
    where: { partnerCode, createdAt: { gte: thirtyDaysAgo } },
    select: { points: true, createdAt: true },
  });

  let rawScore = 0;
  const now = Date.now();
  for (const a of activities) {
    const daysAgo = (now - a.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const decayedPoints = Math.max(0, a.points - daysAgo * DECAY_RATE * 0.1);
    rawScore += decayedPoints;
  }

  const score = Math.min(100, Math.round(rawScore));
  const tier = getTier(score);

  await prisma.partner.update({
    where: { partnerCode },
    data: {
      engagementScore: score,
      engagementTier: tier,
      lastActivityAt: new Date(),
    },
  });

  return score;
}

export async function getEngagementSummary(partnerCode: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const activities = await prisma.partnerActivity.groupBy({
    by: ["action"],
    where: { partnerCode, createdAt: { gte: thirtyDaysAgo } },
    _count: true,
    _sum: { points: true },
  });

  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { engagementScore: true, engagementTier: true, lastActivityAt: true },
  });

  return {
    score: partner?.engagementScore || 0,
    tier: (partner?.engagementTier || "cold") as EngagementTier,
    lastActivityAt: partner?.lastActivityAt,
    breakdown: activities.map((a) => ({
      action: a.action,
      count: a._count,
      totalPoints: a._sum.points || 0,
    })),
  };
}

export const TIER_CONFIG: Record<EngagementTier, { label: string; emoji: string; color: string }> = {
  hot:     { label: "Hot",     emoji: "🔥", color: "text-red-400" },
  active:  { label: "Active",  emoji: "✅", color: "text-green-400" },
  cooling: { label: "Cooling", emoji: "⚠️", color: "text-yellow-400" },
  cold:    { label: "Cold",    emoji: "❄️", color: "text-blue-400" },
};
