import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compareApiKey, signWidgetJwt, getCorsHeaders } from "@/lib/widget-auth";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get("origin"), null),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  try {
    const body = await req.json();
    const { apiKey } = body;
    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "apiKey required" },
        { status: 400, headers: getCorsHeaders(origin, null) }
      );
    }

    const sessions = await prisma.widgetSession.findMany({
      where: { isActive: true },
      include: {
        partner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            partnerCode: true,
            commissionRate: true,
            status: true,
          },
        },
      },
    });

    let matched: (typeof sessions)[0] | null = null;
    for (const session of sessions) {
      const valid = await compareApiKey(apiKey, session.apiKeyHash);
      if (valid) {
        matched = session;
        break;
      }
    }

    if (!matched || matched.partner.status === "blocked") {
      return NextResponse.json(
        { valid: false, error: "Invalid or inactive API key" },
        { status: 401, headers: getCorsHeaders(origin, null) }
      );
    }

    if (matched.origin && origin && origin !== matched.origin) {
      return NextResponse.json(
        { valid: false, error: "Origin not allowed" },
        { status: 403, headers: getCorsHeaders(origin, matched.origin) }
      );
    }

    await prisma.widgetSession.update({
      where: { id: matched.id },
      data: { lastSeenAt: new Date() },
    });

    const token = signWidgetJwt(matched.partner.id, matched.id);

    const totalReferrals = await prisma.widgetReferral.count({
      where: { partnerId: matched.partner.id },
    });

    const totalEarnings = await prisma.commissionLedger.aggregate({
      where: { partnerCode: matched.partner.partnerCode, status: "paid" },
      _sum: { amount: true },
    });

    const cors = getCorsHeaders(origin, matched.origin);
    return NextResponse.json(
      {
        valid: true,
        token,
        partnerName: `${matched.partner.firstName} ${matched.partner.lastName}`,
        partnerCode: matched.partner.partnerCode,
        commissionRate: matched.partner.commissionRate,
        totalReferrals,
        totalEarnings: totalEarnings._sum.amount ?? 0,
      },
      { headers: cors }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: getCorsHeaders(origin, null) }
    );
  }
}
