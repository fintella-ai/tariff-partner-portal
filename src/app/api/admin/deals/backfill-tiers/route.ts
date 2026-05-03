import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const IOR_YES_PATTERN = /\b(we are|yes|i am|the client|they are the|our company|we import)\b/i;

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const deals = await prisma.deal.findMany({
    select: { id: true, importerOfRecord: true, isImporterOfRecord: true, serviceOfInterest: true },
  });

  let tier1 = 0;
  let tier2 = 0;
  let unchanged = 0;

  for (const deal of deals) {
    const iorText = deal.importerOfRecord;
    const isIor = iorText ? IOR_YES_PATTERN.test(iorText) : true;
    const tierLabel = `Tariff Refund Support (${isIor ? "Tier 1" : "Tier 2"})`;

    if (deal.isImporterOfRecord === isIor && deal.serviceOfInterest === tierLabel) {
      unchanged++;
      continue;
    }

    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        isImporterOfRecord: isIor,
        serviceOfInterest: tierLabel,
      },
    });

    if (isIor) tier1++;
    else tier2++;
  }

  return NextResponse.json({
    total: deals.length,
    tier1,
    tier2,
    unchanged,
  });
}
