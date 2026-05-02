import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Force dynamic rendering — queries Prisma at request time.
export const dynamic = "force-dynamic";

/* ── Beta distribution sampler (Jinks method via Gamma) ─────────────────── */

/**
 * Sample from a Gamma(alpha, 1) distribution using the Marsaglia-Tsang
 * method for alpha >= 1, with the Ahrens-Dieter boost for alpha < 1.
 */
function gammaSample(alpha: number): number {
  if (alpha < 1) {
    // Boost: X ~ Gamma(alpha+1) * U^(1/alpha) where U ~ Uniform(0,1)
    return gammaSample(alpha + 1) * Math.pow(Math.random(), 1 / alpha);
  }

  // Marsaglia-Tsang method for alpha >= 1
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x: number;
    let v: number;

    do {
      // Box-Muller for standard normal
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    // Squeeze + rejection test
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Sample from Beta(alpha, beta) using the ratio of independent Gamma variates.
 */
function betaSample(alpha: number, beta: number): number {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

/* ── Cron handler ───────────────────────────────────────────────────────── */

/**
 * GET /api/cron/optimize-variants
 *
 * Vercel Cron target. Runs weekly (configured in vercel.json).
 *
 * Thompson sampling auto-optimizer for widget A/B test variants:
 *   1. Checks PortalSettings.widgetAutoOptimize — no-ops if disabled.
 *   2. Loads all active WidgetVariant rows.
 *   3. For each variant, counts "referral_submitted" (successes) and
 *      "loaded" (trials) from the last 30 days.
 *   4. Requires >= 100 total impressions across all variants.
 *   5. Draws from Beta(successes + 1, trials - successes + 1) for each.
 *   6. Normalizes draws to percentage weights summing to 100.
 *   7. Updates WidgetVariant.weight for each variant.
 */
export async function GET(req: NextRequest) {
  // ── Auth ──
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = new Date();

  // ── Check toggle ──
  const settings = await prisma.portalSettings.findUnique({
    where: { id: "global" },
  });
  if (!settings?.widgetAutoOptimize) {
    return NextResponse.json({
      status: "skipped",
      reason: "widgetAutoOptimize is disabled",
      startedAt: startedAt.toISOString(),
    });
  }

  // ── Load active variants ──
  const variants = await prisma.widgetVariant.findMany({
    where: { isActive: true },
  });

  if (variants.length < 2) {
    return NextResponse.json({
      status: "skipped",
      reason: `Need >= 2 active variants to optimize (found ${variants.length})`,
      startedAt: startedAt.toISOString(),
    });
  }

  // ── Gather impression stats for last 30 days ──
  const thirtyDaysAgo = new Date(startedAt.getTime() - 30 * 24 * 60 * 60 * 1000);

  const stats = await Promise.all(
    variants.map(async (v) => {
      const [loaded, submitted] = await Promise.all([
        prisma.widgetImpression.count({
          where: {
            variantId: v.id,
            event: "loaded",
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        prisma.widgetImpression.count({
          where: {
            variantId: v.id,
            event: "referral_submitted",
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
      ]);
      return { variantId: v.id, name: v.name, oldWeight: v.weight, loaded, submitted };
    }),
  );

  // ── Minimum sample gate ──
  const totalImpressions = stats.reduce((sum, s) => sum + s.loaded, 0);
  if (totalImpressions < 100) {
    return NextResponse.json({
      status: "skipped",
      reason: `Insufficient impressions (${totalImpressions} < 100 minimum)`,
      startedAt: startedAt.toISOString(),
    });
  }

  // ── Thompson sampling ──
  const draws = stats.map((s) => {
    const alpha = s.submitted + 1; // successes + 1
    const beta = Math.max(s.loaded - s.submitted, 0) + 1; // failures + 1
    return { ...s, draw: betaSample(alpha, beta) };
  });

  // Normalize to integer weights summing to 100
  const totalDraw = draws.reduce((sum, d) => sum + d.draw, 0);
  let rawWeights = draws.map((d) => ({
    ...d,
    newWeight: Math.max(1, Math.round((d.draw / totalDraw) * 100)), // floor of 1% per variant
  }));

  // Adjust rounding to hit exactly 100
  const weightSum = rawWeights.reduce((s, w) => s + w.newWeight, 0);
  const diff = 100 - weightSum;
  if (diff !== 0) {
    // Add/subtract the rounding difference to the highest-draw variant
    const sorted = [...rawWeights].sort((a, b) => b.draw - a.draw);
    const target = sorted[0];
    rawWeights = rawWeights.map((w) =>
      w.variantId === target.variantId
        ? { ...w, newWeight: Math.max(1, w.newWeight + diff) }
        : w,
    );
  }

  // ── Persist new weights ──
  await Promise.all(
    rawWeights.map((w) =>
      prisma.widgetVariant.update({
        where: { id: w.variantId },
        data: { weight: w.newWeight },
      }),
    ),
  );

  // ── Log ──
  const log = rawWeights.map((w) => ({
    variant: w.name,
    oldWeight: w.oldWeight,
    newWeight: w.newWeight,
    loaded: w.loaded,
    submitted: w.submitted,
    draw: Math.round(w.draw * 10000) / 10000,
  }));

  console.log("[optimize-variants] Thompson sampling complete:", JSON.stringify(log));

  return NextResponse.json({
    status: "optimized",
    startedAt: startedAt.toISOString(),
    totalImpressions,
    variants: log,
  });
}
