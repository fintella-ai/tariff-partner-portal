import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    // Fetch partner's commission tier and rate — these drive the waterfall
    const partner = await prisma.partner.findUnique({
      where: { partnerCode },
      select: { tier: true, commissionRate: true, l3Enabled: true },
    });

    // Fetch commission ledger entries
    const ledger = await prisma.commissionLedger.findMany({
      where: { partnerCode },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      tier: partner?.tier ?? "l1",
      commissionRate: partner?.commissionRate ?? 0.25,
      l3Enabled: partner?.l3Enabled ?? false,
      ledger,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch commissions" }, { status: 500 });
  }
}
