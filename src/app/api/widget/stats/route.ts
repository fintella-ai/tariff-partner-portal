import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWidgetJwt, getCorsHeaders } from "@/lib/widget-auth";

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get("origin"), null),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin, null);

  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  }

  const payload = verifyWidgetJwt(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401, headers: cors });
  }

  const partnerId = payload.sub;

  const [total, pending, converted, recentReferrals] = await Promise.all([
    prisma.widgetReferral.count({ where: { partnerId } }),
    prisma.widgetReferral.count({ where: { partnerId, status: "submitted" } }),
    prisma.widgetReferral.count({ where: { partnerId, status: "converted" } }),
    prisma.widgetReferral.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        clientCompanyName: true,
        status: true,
        createdAt: true,
        estimatedImportValue: true,
      },
    }),
  ]);

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { partnerCode: true },
  });

  const totalEarnings = partner
    ? await prisma.commissionLedger.aggregate({
        where: { partnerCode: partner.partnerCode, status: "paid" },
        _sum: { amount: true },
      })
    : { _sum: { amount: null } };

  const pendingEarnings = partner
    ? await prisma.commissionLedger.aggregate({
        where: { partnerCode: partner.partnerCode, status: { in: ["pending", "due"] } },
        _sum: { amount: true },
      })
    : { _sum: { amount: null } };

  return NextResponse.json(
    {
      totalReferrals: total,
      pendingReferrals: pending,
      convertedReferrals: converted,
      totalCommissionsEarned: totalEarnings._sum.amount ?? 0,
      pendingCommissions: pendingEarnings._sum.amount ?? 0,
      recentReferrals,
    },
    { headers: cors }
  );
}
