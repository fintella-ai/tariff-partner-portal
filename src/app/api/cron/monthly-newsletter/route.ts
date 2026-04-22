import { NextRequest, NextResponse } from "next/server";
import { sendMonthlyNewsletterToAllPartners } from "@/lib/sendgrid";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/monthly-newsletter
 *
 * Vercel Cron target. Fires on the 1st of each month at 14:00 UTC
 * (configured in vercel.json "crons"). Iterates every active partner
 * and sends one email using the `monthly_newsletter` EmailTemplate row,
 * so super admins can edit the body from /admin/communications Templates.
 *
 * Three independent kill switches protect against unintended sends:
 *   1. CRON_SECRET — REQUIRED in production. Any request without a
 *      matching bearer token is rejected. No demo bypass in prod
 *      (prior behavior allowed unauthenticated hits when the env was
 *      unset, which was too permissive for a batch-send endpoint).
 *   2. DISABLE_ALL_NEWSLETTERS env — master off switch. When truthy,
 *      the cron returns success without sending, regardless of the
 *      template's enabled flag. Flip this on Vercel when you need a
 *      hard stop across all campaign sends.
 *   3. EmailTemplate.enabled — the in-app toggle visible in
 *      /admin/communications Email → Templates. False short-circuits
 *      at the template lookup so no sends occur.
 *
 * Any of the three halts the batch. The response body includes the
 * reason so operators can see which gate tripped.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isProd =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  // Gate 1: CRON_SECRET. Required in production; optional in dev so
  // local testing works without extra setup.
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (isProd) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured — refusing to send in production" },
      { status: 503 }
    );
  }

  // Gate 2: master kill switch env.
  const killSwitch = process.env.DISABLE_ALL_NEWSLETTERS;
  if (killSwitch && /^(1|true|yes|on)$/i.test(killSwitch)) {
    console.log("[cron/monthly-newsletter] skipped — DISABLE_ALL_NEWSLETTERS is set");
    return NextResponse.json({
      ok: true,
      skippedReason: "env:DISABLE_ALL_NEWSLETTERS",
      sent: 0,
      failed: 0,
      skipped: 0,
      firedAt: new Date().toISOString(),
    });
  }

  // Gate 3: EmailTemplate.enabled. Re-read here so the response can
  // report WHY the send was skipped, instead of silently returning
  // sent=0 (prior behavior when the template was disabled inside
  // sendMonthlyNewsletterToAllPartners).
  const tplRow = await prisma.emailTemplate.findUnique({
    where: { key: "monthly_newsletter" },
    select: { enabled: true, isDraft: true },
  });
  if (!tplRow) {
    console.log("[cron/monthly-newsletter] skipped — template row missing");
    return NextResponse.json({
      ok: true,
      skippedReason: "template:missing",
      sent: 0,
      failed: 0,
      skipped: 0,
      firedAt: new Date().toISOString(),
    });
  }
  if (!tplRow.enabled) {
    console.log("[cron/monthly-newsletter] skipped — template disabled via admin UI");
    return NextResponse.json({
      ok: true,
      skippedReason: "template:disabled",
      sent: 0,
      failed: 0,
      skipped: 0,
      firedAt: new Date().toISOString(),
    });
  }
  if (tplRow.isDraft) {
    console.log("[cron/monthly-newsletter] skipped — template marked as draft");
    return NextResponse.json({
      ok: true,
      skippedReason: "template:draft",
      sent: 0,
      failed: 0,
      skipped: 0,
      firedAt: new Date().toISOString(),
    });
  }

  const result = await sendMonthlyNewsletterToAllPartners();
  console.log(
    `[cron/monthly-newsletter] sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`
  );
  return NextResponse.json({ ok: true, ...result, firedAt: new Date().toISOString() });
}
