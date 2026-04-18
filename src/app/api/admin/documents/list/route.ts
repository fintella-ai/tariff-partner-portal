import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/documents/list
 * Returns all documents across all partners with partner names.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Fetch uploaded documents
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Fetch partnership agreements (SignWell-sent)
    const agreements = await prisma.partnershipAgreement.findMany({
      orderBy: { sentDate: "desc" },
    });

    // Get partner names for both
    const allCodes = Array.from(new Set([
      ...documents.map((d: any) => d.partnerCode),
      ...agreements.map((a: any) => a.partnerCode),
    ]));
    const partners = await prisma.partner.findMany({
      where: { partnerCode: { in: allCodes } },
      select: { id: true, partnerCode: true, firstName: true, lastName: true },
    });

    const infoMap: Record<string, { name: string; id: string }> = {};
    partners.forEach((p: any) => {
      infoMap[p.partnerCode] = { name: `${p.firstName} ${p.lastName}`, id: p.id };
    });

    const enrichedDocs = documents.map((d: any) => ({
      ...d,
      partnerName: infoMap[d.partnerCode]?.name || d.partnerCode,
      partnerId: infoMap[d.partnerCode]?.id || null,
    }));

    // Build a set of signwellDocumentIds that already have a real Document
    // row so we don't double-list them below. Our Document rows stamp
    // `uploadedBy = "SignWell:<signwellDocId>"` when created by the
    // document_completed webhook (or the backfill).
    const signwellDocIdsWithDoc = new Set<string>();
    for (const d of documents) {
      const ub = (d as any).uploadedBy as string | null;
      if (ub && ub.startsWith("SignWell:")) {
        signwellDocIdsWithDoc.add(ub.slice("SignWell:".length));
      }
    }

    // Convert agreements to document-like entries for the synthetic log,
    // but skip any agreement whose completed PDF is already represented
    // by a real Document row — otherwise the admin view shows the signed
    // agreement twice.
    const agreementDocs = agreements
      .filter((a: any) =>
        !(a.signwellDocumentId && signwellDocIdsWithDoc.has(a.signwellDocumentId))
      )
      .map((a: any) => ({
        id: `agreement-${a.id}`,
        partnerCode: a.partnerCode,
        partnerName: infoMap[a.partnerCode]?.name || a.partnerCode,
        partnerId: infoMap[a.partnerCode]?.id || null,
        docType: "agreement",
        fileName: `Partnership Agreement v${a.version}`,
        fileUrl: a.documentUrl || "",
        status: a.status === "signed" || a.status === "approved" ? "approved"
          : a.status === "partner_signed" ? "under_review"
          : a.status === "pending" ? "uploaded"
          : a.status,
        uploadedBy: "SignWell",
        createdAt: a.sentDate || a.createdAt,
        signwellDocumentId: a.signwellDocumentId,
        agreementVersion: a.version,
        agreementStatus: a.status,
      }));

    return NextResponse.json({ documents: [...agreementDocs, ...enrichedDocs] });
  } catch {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}
