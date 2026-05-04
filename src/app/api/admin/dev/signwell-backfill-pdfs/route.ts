import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getCompletedPdfUrl } from "@/lib/signwell";

/**
 * POST /api/admin/dev/signwell-backfill-pdfs
 *
 * For every signed PartnershipAgreement:
 *   1. If documentUrl is missing, fetch it from SignWell's
 *      /documents/{id}/completed_pdf?url_only=true&audit_page=true endpoint
 *      and persist it on the agreement row.
 *   2. Create the matching Document row (docType="agreement") so the signed
 *      PDF appears in the partner "My Documents" view and the admin
 *      documents log alongside every other uploaded doc.
 *
 * Idempotent — dedupes Documents on `uploadedBy = SignWell:<signwellDocumentId>`.
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
      version: true,
      signedDate: true,
      signwellDocumentId: true,
      documentUrl: true,
    },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;
  const results: Array<{
    partnerCode: string;
    agreementId: string;
    status: "created" | "updated" | "exists" | "no_url";
    fileUrl?: string;
  }> = [];

  for (const a of agreements) {
    let fileUrl = a.documentUrl || "";
    if (!fileUrl && a.signwellDocumentId) {
      const fetched = await getCompletedPdfUrl(a.signwellDocumentId).catch(
        () => null
      );
      if (fetched) {
        fileUrl = fetched;
        await prisma.partnershipAgreement.update({
          where: { id: a.id },
          data: { documentUrl: fileUrl },
        });
      }
    }

    if (!fileUrl) {
      missing++;
      results.push({
        partnerCode: a.partnerCode,
        agreementId: a.id,
        status: "no_url",
      });
      continue;
    }

    const uploadedBy = `SignWell:${a.signwellDocumentId || a.id}`;
    const existing = await prisma.document.findFirst({
      where: { partnerCode: a.partnerCode, uploadedBy },
      select: { id: true, fileUrl: true },
    });

    if (existing) {
      if (existing.fileUrl !== fileUrl) {
        await prisma.document.update({
          where: { id: existing.id },
          data: { fileUrl, status: "approved" },
        });
        updated++;
        results.push({
          partnerCode: a.partnerCode,
          agreementId: a.id,
          status: "updated",
          fileUrl,
        });
      } else {
        skipped++;
        results.push({
          partnerCode: a.partnerCode,
          agreementId: a.id,
          status: "exists",
        });
      }
      continue;
    }

    const datePart = a.signedDate
      ? new Date(a.signedDate).toLocaleDateString("en-US")
      : "";
    await prisma.document.create({
      data: {
        partnerCode: a.partnerCode,
        docType: "agreement",
        fileName: `Partnership Agreement v${a.version} — Signed${datePart ? ` ${datePart}` : ""}`,
        fileUrl,
        status: "approved",
        uploadedBy,
      },
    });
    created++;
    results.push({
      partnerCode: a.partnerCode,
      agreementId: a.id,
      status: "created",
      fileUrl,
    });
  }

  return NextResponse.json({
    scanned: agreements.length,
    created,
    updated,
    skipped,
    missing,
    results,
  });
}
