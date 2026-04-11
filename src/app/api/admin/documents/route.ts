import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/documents
 * Admin uploads a document for a partner (agreement, W9, etc.)
 * Expects JSON with: partnerCode, docType, fileName, fileData (base64), status
 *
 * If docType is "agreement", also creates/updates the PartnershipAgreement
 * and sets the partner status to "active".
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { partnerCode, docType, fileName, fileData } = body;

    if (!partnerCode || !docType || !fileName) {
      return NextResponse.json({ error: "partnerCode, docType, and fileName are required" }, { status: 400 });
    }

    // Verify partner exists
    const partner = await prisma.partner.findUnique({ where: { partnerCode } });
    if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

    // Create the document record
    const document = await prisma.document.create({
      data: {
        partnerCode,
        docType,
        fileName,
        fileUrl: fileData || "", // base64 data URL or empty
        status: "approved", // admin-uploaded documents are auto-approved
        uploadedBy: "admin",
      },
    });

    // If this is an agreement upload, handle the agreement + partner status
    if (docType === "agreement") {
      // Find latest agreement version
      const latestAgreement = await prisma.partnershipAgreement.findFirst({
        where: { partnerCode },
        orderBy: { version: "desc" },
      });

      const nextVersion = (latestAgreement?.version || 0) + 1;

      // Create or update agreement as signed
      await prisma.partnershipAgreement.create({
        data: {
          partnerCode,
          version: nextVersion,
          status: "signed",
          signedDate: new Date(),
          sentDate: new Date(),
          documentUrl: fileData || null,
        },
      });

      // Activate the partner
      if (partner.status === "pending") {
        await prisma.partner.update({
          where: { partnerCode },
          data: { status: "active" },
        });
      }
    }

    return NextResponse.json({
      document,
      partnerActivated: docType === "agreement" && partner.status === "pending",
    }, { status: 201 });
  } catch (err: any) {
    console.error("[Admin Documents] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to upload document" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/documents
 * Void a document. Keeps the record for audit but marks it as voided.
 * If it's an agreement, sets the partner back to "pending".
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { documentId, action } = body;

    if (!documentId || action !== "void") {
      return NextResponse.json({ error: "documentId and action='void' are required" }, { status: 400 });
    }

    // Find the document
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    // Mark document as voided (keep for audit trail)
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "voided" },
    });

    // If it's an agreement, also void the partnership agreement and set partner to pending
    if (doc.docType === "agreement") {
      // Void the latest signed agreement
      const latestAgreement = await prisma.partnershipAgreement.findFirst({
        where: { partnerCode: doc.partnerCode, status: "signed" },
        orderBy: { version: "desc" },
      });

      if (latestAgreement) {
        await prisma.partnershipAgreement.update({
          where: { id: latestAgreement.id },
          data: { status: "voided" },
        });
      }

      // Set partner back to pending
      await prisma.partner.update({
        where: { partnerCode: doc.partnerCode },
        data: { status: "pending" },
      });
    }

    // If it's a W9, just void the document (partner stays active)
    // The W9 status will show "needed" again since no approved W9 exists

    return NextResponse.json({
      success: true,
      partnerSetPending: doc.docType === "agreement",
    });
  } catch (err: any) {
    console.error("[Admin Documents Void] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to void document" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/documents
 * Approve a document that is "under_review" (uploaded by L1 partner).
 * If it's an agreement, activates the partner.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { documentId, action } = body;

    if (!documentId || action !== "approve") {
      return NextResponse.json({ error: "documentId and action='approve' are required" }, { status: 400 });
    }

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    // Approve the document
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "approved" },
    });

    // If it's an agreement, update the partnership agreement and activate partner
    if (doc.docType === "agreement") {
      const latestAgreement = await prisma.partnershipAgreement.findFirst({
        where: { partnerCode: doc.partnerCode, status: { in: ["pending", "under_review"] } },
        orderBy: { version: "desc" },
      });

      if (latestAgreement) {
        await prisma.partnershipAgreement.update({
          where: { id: latestAgreement.id },
          data: { status: "approved", signedDate: new Date() },
        });
      }

      // Activate partner
      await prisma.partner.update({
        where: { partnerCode: doc.partnerCode },
        data: { status: "active" },
      });
    }

    return NextResponse.json({
      success: true,
      partnerActivated: doc.docType === "agreement",
    });
  } catch (err: any) {
    console.error("[Admin Documents Approve] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to approve document" }, { status: 500 });
  }
}
