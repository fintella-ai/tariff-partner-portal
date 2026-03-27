import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendForSigning, getEmbeddedSigningUrl, isSignWellConfigured } from "@/lib/signwell";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";

/**
 * GET /api/agreement
 * Returns the current partner's agreement status.
 */
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
    const agreement = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode },
      orderBy: { version: "desc" },
    });

    // For pending agreements, try to get the embedded signing URL
    let embeddedSigningUrl = agreement?.embeddedSigningUrl || null;
    if (agreement?.status === "pending" && !embeddedSigningUrl && agreement.signwellDocumentId) {
      embeddedSigningUrl = await getEmbeddedSigningUrl(agreement.signwellDocumentId);
    }

    return NextResponse.json({
      agreement: agreement
        ? {
            id: agreement.id,
            status: agreement.status,
            version: agreement.version,
            sentDate: agreement.sentDate,
            signedDate: agreement.signedDate,
            documentUrl: agreement.documentUrl,
            embeddedSigningUrl,
            signwellConfigured: isSignWellConfigured(),
          }
        : null,
      signwellConfigured: isSignWellConfigured(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch agreement status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agreement
 * Partner requests to sign their agreement.
 * Creates a PartnershipAgreement record and sends via SignWell (or demo mode).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  const partnerEmail = session.user.email;
  const partnerName = session.user.name || "Partner";
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    // Check if there's already a pending or signed agreement
    const existing = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode, status: { in: ["pending", "signed"] } },
      orderBy: { version: "desc" },
    });

    if (existing?.status === "signed") {
      return NextResponse.json({ error: "Agreement already signed" }, { status: 400 });
    }

    if (existing?.status === "pending") {
      // Try to get embedded signing URL if not stored
      let existingEmbedUrl = existing.embeddedSigningUrl;
      if (!existingEmbedUrl && existing.signwellDocumentId) {
        existingEmbedUrl = await getEmbeddedSigningUrl(existing.signwellDocumentId) || null;
      }
      return NextResponse.json({
        agreement: {
          id: existing.id,
          status: existing.status,
          version: existing.version,
          sentDate: existing.sentDate,
          embeddedSigningUrl: existingEmbedUrl,
        },
        message: "Agreement already sent for signing",
      });
    }

    // Determine next version
    const latestVersion = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latestVersion?.version || 0) + 1;

    // Send via SignWell (with embedded signing enabled)
    const { documentId, embeddedSigningUrl } = await sendForSigning({
      name: `${FIRM_SHORT} Partnership Agreement — ${partnerName}`,
      subject: `${FIRM_SHORT} Partnership Agreement`,
      message: `Hi ${partnerName}, please review and sign your ${FIRM_NAME} partnership agreement.`,
      recipients: [
        {
          id: partnerCode,
          email: partnerEmail || "",
          name: partnerName,
          role: "Partner",
        },
      ],
    });

    // Create agreement record
    const agreement = await prisma.partnershipAgreement.create({
      data: {
        partnerCode,
        version: nextVersion,
        signwellDocumentId: documentId,
        embeddedSigningUrl: embeddedSigningUrl || null,
        status: "pending",
        sentDate: new Date(),
      },
    });

    return NextResponse.json({
      agreement: {
        id: agreement.id,
        status: agreement.status,
        version: agreement.version,
        sentDate: agreement.sentDate,
        embeddedSigningUrl: embeddedSigningUrl || null,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to send agreement" },
      { status: 500 }
    );
  }
}
