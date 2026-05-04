import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelDocument } from "@/lib/signwell";

/**
 * POST /api/admin/dev/void-all-agreements
 *
 * Nuclear option: voids ALL active agreements in SignWell and resets
 * all partners to pending. Use when restarting the agreement process
 * from scratch with corrected signing order.
 *
 * Super admin only.
 */
export async function POST() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  const agreements = await prisma.partnershipAgreement.findMany({
    where: { status: { notIn: ["voided", "not_sent"] } },
  });

  let voided = 0;
  let cancelledInSignWell = 0;
  let errors = 0;

  for (const agreement of agreements) {
    try {
      if (agreement.signwellDocumentId) {
        const cancelled = await cancelDocument(agreement.signwellDocumentId).catch(() => false);
        if (cancelled) cancelledInSignWell++;
      }

      await prisma.partnershipAgreement.update({
        where: { id: agreement.id },
        data: { status: "voided" },
      });
      voided++;
    } catch {
      errors++;
    }
  }

  // Reset all non-admin partners to pending
  const resetResult = await prisma.partner.updateMany({
    where: { status: { not: "blocked" } },
    data: { status: "pending" },
  });

  return NextResponse.json({
    voided,
    cancelledInSignWell,
    errors,
    partnersReset: resetResult.count,
    message: "All agreements voided. All partners set to pending. Ready to resend with correct signing order.",
  });
}
