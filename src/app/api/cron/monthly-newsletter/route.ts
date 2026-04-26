import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fireWorkflowTrigger } from "@/lib/workflow-engine";

/**
 * GET /api/cron/monthly-newsletter
 *
 * Vercel Cron target. Fires on the 1st of each month at 14:00 UTC.
 * Now workflow-driven: fires the `newsletter.monthly` trigger for each
 * active partner. The workflow engine handles email sending via the
 * email.send action + monthly_newsletter EmailTemplate.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long" });
  const year = now.getFullYear();

  const partners = await prisma.partner.findMany({
    where: { status: "active" },
    select: { partnerCode: true, firstName: true, lastName: true, email: true },
  });

  let fired = 0;
  for (const partner of partners) {
    await fireWorkflowTrigger("newsletter.monthly", {
      partner,
      month,
      year,
      portalUrl: process.env.NEXTAUTH_URL || "https://fintella.partners",
    });
    fired++;
  }

  return NextResponse.json({
    ok: true,
    fired,
    totalPartners: partners.length,
    firedAt: now.toISOString(),
  });
}
