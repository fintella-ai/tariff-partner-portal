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
    // Fetch commission rate overrides
    const overrides = await prisma.partnerOverride.findUnique({
      where: { partnerCode },
    });

    // Fetch commission ledger entries
    const ledger = await prisma.commissionLedger.findMany({
      where: { partnerCode },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      overrides: overrides
        ? {
            l1Rate: overrides.l1Rate,
            l2Rate: overrides.l2Rate,
            l3Rate: overrides.l3Rate,
            l3Enabled: overrides.l3Enabled,
          }
        : null,
      ledger,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch commissions" }, { status: 500 });
  }
}
