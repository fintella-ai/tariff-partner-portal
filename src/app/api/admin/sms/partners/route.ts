import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["super_admin", "admin", "accounting", "partner_support"];

/**
 * GET /api/admin/sms/partners
 *
 * Returns three buckets for the Communications Hub → SMS tab:
 *   - optedIn   : Partners with smsOptIn=true + a mobile on file
 *   - notOptedIn: active/pending partners with a mobile but smsOptIn=false
 *   - optedOut  : partners who have ever replied STOP (inbound SmsLog with
 *                 template="stop_keyword") — includes those who never opted
 *                 in AND those who opted in then opted out. Distinct signal
 *                 because the bulk opt-in UI should skip them.
 *
 * Messages-sent count per opted-in partner comes from outbound SmsLog rows
 * with status="sent" (excludes demo / failed / skipped).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [optedIn, candidates, stopCodes, sentCounts, monthSentCount, monthFailedCount] = await Promise.all([
      prisma.partner.findMany({
        where: { smsOptIn: true, mobilePhone: { not: null } },
        select: {
          id: true,
          partnerCode: true,
          firstName: true,
          lastName: true,
          mobilePhone: true,
          status: true,
          optInDate: true,
        },
        orderBy: { optInDate: "desc" },
      }),
      // "Candidates" for opt-in: partners we *could* reach — has mobile,
      // is not blocked. We refine to notOptedIn client-side after merging
      // the stop list, since a partner who replied STOP shouldn't get
      // another bulk opt-in request even though smsOptIn=false.
      prisma.partner.findMany({
        where: {
          mobilePhone: { not: null },
          smsOptIn: false,
          status: { not: "blocked" },
        },
        select: {
          id: true,
          partnerCode: true,
          firstName: true,
          lastName: true,
          mobilePhone: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.smsLog.findMany({
        where: { template: "stop_keyword", direction: "inbound" },
        distinct: ["partnerCode"],
        select: { partnerCode: true, createdAt: true },
      }),
      prisma.smsLog.groupBy({
        by: ["partnerCode"],
        where: { direction: "outbound", status: "sent" },
        _count: { _all: true },
      }),
      prisma.smsLog.count({
        where: {
          direction: "outbound",
          status: "sent",
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      prisma.smsLog.count({
        where: {
          direction: "outbound",
          status: "failed",
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]);

    const stopByCode = new Map<string, Date>();
    for (const s of stopCodes) {
      if (s.partnerCode) stopByCode.set(s.partnerCode, s.createdAt);
    }

    const sentByCode = new Map<string, number>();
    for (const row of sentCounts) {
      if (row.partnerCode) sentByCode.set(row.partnerCode, (row as any)._count._all);
    }

    const enrichedOptedIn = optedIn.map((p) => ({
      ...p,
      messagesSent: sentByCode.get(p.partnerCode) || 0,
    }));

    const notOptedIn: any[] = [];
    const optedOut: any[] = [];
    for (const p of candidates) {
      const stoppedAt = stopByCode.get(p.partnerCode);
      if (stoppedAt) {
        optedOut.push({ ...p, stoppedAt });
      } else {
        notOptedIn.push(p);
      }
    }

    // Also include opted-in partners who have since replied STOP (rare
    // but possible) in the optedOut bucket so the admin sees the full
    // unsubscribe picture.
    const alsoOptedOut = enrichedOptedIn
      .filter((p) => stopByCode.has(p.partnerCode))
      .map((p) => ({ ...p, stoppedAt: stopByCode.get(p.partnerCode) }));
    optedOut.push(...alsoOptedOut);

    // Delivery rate = sent / (sent + failed). Demo + skipped sends aren't
    // "delivery attempts" so they're excluded from the denominator.
    const attempts = monthSentCount + monthFailedCount;
    const deliveryRate = attempts > 0 ? monthSentCount / attempts : null;

    return NextResponse.json({
      optedIn: enrichedOptedIn,
      notOptedIn,
      optedOut,
      messagesSentThisMonth: monthSentCount,
      messagesFailedThisMonth: monthFailedCount,
      deliveryRate,
    });
  } catch (e) {
    console.error("[sms/partners GET] error:", e);
    return NextResponse.json({ error: "Failed to fetch SMS partners" }, { status: 500 });
  }
}
