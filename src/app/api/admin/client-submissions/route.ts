import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["super_admin", "admin", "accounting", "partner_support"];

/**
 * GET /api/admin/client-submissions
 * Returns all ClientSubmission records with synced deal stage.
 * Before returning, re-syncs any linked deals to pick up stage changes.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const submissions = await prisma.clientSubmission.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Re-sync deal stages for linked submissions
  const dealIds = submissions.filter((s) => s.dealId).map((s) => s.dealId!);
  if (dealIds.length > 0) {
    const deals = await prisma.deal.findMany({
      where: { id: { in: dealIds } },
      select: { id: true, stage: true },
    });
    const dealMap = new Map(deals.map((d) => [d.id, d.stage]));
    for (const s of submissions) {
      if (s.dealId && dealMap.has(s.dealId)) {
        const currentStage = dealMap.get(s.dealId)!;
        if (s.dealStage !== currentStage) {
          s.dealStage = currentStage;
          prisma.clientSubmission.update({
            where: { id: s.id },
            data: { dealStage: currentStage },
          }).catch(() => {});
        }
      }
    }
  }

  // Also try to link unlinked submissions by email
  const unlinked = submissions.filter((s) => !s.dealId);
  if (unlinked.length > 0) {
    const emails = unlinked.map((s) => s.email.toLowerCase());
    const matchingDeals = await prisma.deal.findMany({
      where: { clientEmail: { in: emails } },
      select: { id: true, stage: true, clientEmail: true },
      orderBy: { createdAt: "desc" },
    });
    const dealByEmail = new Map<string, { id: string; stage: string }>();
    for (const d of matchingDeals) {
      if (d.clientEmail && !dealByEmail.has(d.clientEmail.toLowerCase())) {
        dealByEmail.set(d.clientEmail.toLowerCase(), { id: d.id, stage: d.stage });
      }
    }
    for (const s of unlinked) {
      const match = dealByEmail.get(s.email.toLowerCase());
      if (match) {
        s.dealId = match.id;
        s.dealStage = match.stage;
        prisma.clientSubmission.update({
          where: { id: s.id },
          data: { dealId: match.id, dealStage: match.stage },
        }).catch(() => {});
      }
    }
  }

  // KPI stats
  const total = submissions.length;
  const linked = submissions.filter((s) => s.dealId).length;
  const byStage: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byPartner: Record<string, number> = {};
  for (const s of submissions) {
    const stage = s.dealStage || "pending";
    byStage[stage] = (byStage[stage] || 0) + 1;
    bySource[s.source] = (bySource[s.source] || 0) + 1;
    const pc = s.partnerCode || "direct";
    byPartner[pc] = (byPartner[pc] || 0) + 1;
  }

  // Conversion funnel
  const funnel = {
    submitted: total,
    qualified: submissions.filter((s) => s.dealStage && ["qualified", "client_engaged", "in_process", "closedwon"].includes(s.dealStage)).length,
    disqualified: submissions.filter((s) => s.dealStage === "disqualified").length,
    engaged: submissions.filter((s) => s.dealStage && ["client_engaged", "in_process", "closedwon"].includes(s.dealStage)).length,
    inProcess: submissions.filter((s) => s.dealStage && ["in_process", "closedwon"].includes(s.dealStage)).length,
    won: submissions.filter((s) => s.dealStage === "closedwon").length,
  };

  return NextResponse.json({
    submissions,
    stats: { total, linked, unlinked: total - linked, byStage, bySource, byPartner, funnel },
  });
}
