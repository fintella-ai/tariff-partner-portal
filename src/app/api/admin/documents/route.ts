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
