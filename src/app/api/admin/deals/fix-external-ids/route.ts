import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/deals/fix-external-ids
 *
 * One-time super_admin endpoint to:
 * 1. Delete webhook-created duplicate deals (contact IDs as externalDealId, pre-import)
 * 2. Swap imported deals from HubSpot deal IDs → contact IDs
 *
 * Body: { dealToContact: Record<string, string>, dupeIds: string[] }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { dealToContact, dupeIds } = await req.json();

  const results = { deleted: 0, swapped: 0, errors: [] as string[] };

  // Step 1: Delete webhook dupes
  for (const id of dupeIds) {
    try {
      await prisma.dealNote.deleteMany({ where: { dealId: id } });
      await prisma.commissionLedger.deleteMany({ where: { dealId: id } });
      await prisma.deal.delete({ where: { id } });
      results.deleted++;
    } catch (e: any) {
      results.errors.push(`Delete ${id}: ${e.message}`);
    }
  }

  // Step 2: Swap externalDealId from deal ID → contact ID
  for (const [dealId, contactId] of Object.entries(dealToContact)) {
    try {
      const deal = await prisma.deal.findUnique({
        where: { externalDealId: dealId as string },
        select: { id: true },
      });
      if (deal) {
        await prisma.deal.update({
          where: { id: deal.id },
          data: { externalDealId: contactId as string },
        });
        results.swapped++;
      }
    } catch (e: any) {
      results.errors.push(`Swap ${dealId}: ${e.message}`);
    }
  }

  return NextResponse.json(results);
}
