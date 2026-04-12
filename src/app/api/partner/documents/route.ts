import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/partner/documents
 * Returns the current partner's uploaded documents.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const documents = await prisma.document.findMany({
      where: { partnerCode },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

/**
 * POST /api/partner/documents
 * Partner uploads a document (bank letter, voided check, etc.)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const body = await req.json();
    const { docType, fileName, fileData } = body;

    if (!docType || !fileName) {
      return NextResponse.json({ error: "docType and fileName are required" }, { status: 400 });
    }

    const allowedTypes = ["w9", "w8", "tax_form", "bank_letter", "voided_check"];
    if (!allowedTypes.includes(docType)) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
    }

    const document = await prisma.document.create({
      data: {
        partnerCode,
        docType,
        fileName,
        fileUrl: fileData || "",
        status: "uploaded",
        uploadedBy: "partner",
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}
