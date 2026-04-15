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
    // Fetch partner's commission rate overrides from the Partner record
    const partner = await prisma.partner.findUnique({
      where: { partnerCode },
      select: { l1Rate: true, l2Rate: true, l3Rate: true, l3Enabled: true },
    });

    // Fetch commission ledger entries
    const ledger = await prisma.commissionLedger.findMany({
      where: { partnerCode },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const hasOverrides = partner && (partner.l1Rate != null || partner.l2Rate != null || partner.l3Rate != null);

    return NextResponse.json({
      overrides: hasOverrides
        ? {
            l1Rate: partner.l1Rate,
            l2Rate: partner.l2Rate,
            l3Rate: partner.l3Rate,
            l3Enabled: partner.l3Enabled,
          }
        : null,
      ledger,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch commissions" }, { status: 500 });
  }
}
