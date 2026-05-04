import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getCompletedDocumentFields, mapSignWellFieldsToPayoutData } from "@/lib/signwell";

/**
 * POST /api/admin/dev/signwell-backfill-payouts
 *
 * For every signed PartnershipAgreement with a SignWell document ID,
 * fetch completed fields and populate the PartnerProfile payout columns.
 * Skips partners whose payout is already locked (payoutLockedAt set).
 */
export async function POST() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const agreements = await prisma.partnershipAgreement.findMany({
    where: {
      status: { in: ["signed", "approved"] },
      signwellDocumentId: { not: null },
    },
    select: {
      id: true,
      partnerCode: true,
      signwellDocumentId: true,
    },
  });

  const alreadyLocked = await prisma.partnerProfile.findMany({
    where: { payoutLockedAt: { not: null } },
    select: { partnerCode: true },
  });
  const lockedSet = new Set(alreadyLocked.map((p) => p.partnerCode));

  let filled = 0;
  let skipped = 0;
  let noFields = 0;
  const results: Array<{
    partnerCode: string;
    status: "filled" | "skipped_locked" | "no_fields" | "error";
    fieldCount?: number;
    rawFields?: Record<string, string>;
  }> = [];

  for (const a of agreements) {
    if (lockedSet.has(a.partnerCode)) {
      skipped++;
      results.push({ partnerCode: a.partnerCode, status: "skipped_locked" });
      continue;
    }

    try {
      const fields = await getCompletedDocumentFields(a.signwellDocumentId!);
      if (!fields || Object.keys(fields).length === 0) {
        noFields++;
        results.push({ partnerCode: a.partnerCode, status: "no_fields" });
        continue;
      }

      const { profileData, partnerData } = mapSignWellFieldsToPayoutData(fields);

      if (Object.keys(partnerData).length > 0) {
        await prisma.partner.update({
          where: { partnerCode: a.partnerCode },
          data: partnerData,
        }).catch(() => {});
      }

      if (Object.keys(profileData).length > 0) {
        profileData.payoutLockedAt = new Date();
        profileData.payoutLockedBy = "agreement";
        await prisma.partnerProfile.upsert({
          where: { partnerCode: a.partnerCode },
          update: profileData,
          create: { partnerCode: a.partnerCode, ...profileData },
        });
        filled++;
        results.push({ partnerCode: a.partnerCode, status: "filled", fieldCount: Object.keys(profileData).length, rawFields: fields });
      } else {
        noFields++;
        results.push({ partnerCode: a.partnerCode, status: "no_fields", rawFields: fields });
      }
    } catch {
      results.push({ partnerCode: a.partnerCode, status: "error" });
    }
  }

  return NextResponse.json({
    scanned: agreements.length,
    filled,
    skipped,
    noFields,
    results,
  });
}
