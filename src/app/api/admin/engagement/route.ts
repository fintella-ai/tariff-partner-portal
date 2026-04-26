import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEngagementSummary } from "@/lib/engagement";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const partnerCode = url.searchParams.get("partnerCode");

  if (partnerCode) {
    const summary = await getEngagementSummary(partnerCode);
    return NextResponse.json(summary);
  }

  const partners = await prisma.partner.findMany({
    where: { status: "active" },
    select: {
      partnerCode: true,
      firstName: true,
      lastName: true,
      engagementScore: true,
      engagementTier: true,
      lastActivityAt: true,
    },
    orderBy: { engagementScore: "desc" },
  });

  const tierCounts = {
    hot: partners.filter((p) => p.engagementTier === "hot").length,
    active: partners.filter((p) => p.engagementTier === "active").length,
    cooling: partners.filter((p) => p.engagementTier === "cooling").length,
    cold: partners.filter((p) => p.engagementTier === "cold").length,
  };

  return NextResponse.json({ partners, tierCounts, total: partners.length });
}
