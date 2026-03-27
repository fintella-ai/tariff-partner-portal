import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendForSigning, cancelDocument, isSignWellConfigured } from "@/lib/signwell";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";

/**
 * GET /api/admin/agreement/[partnerCode]
 * Get agreement status for a specific partner.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { partnerCode: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const agreements = await prisma.partnershipAgreement.findMany({
      where: { partnerCode: params.partnerCode },
      orderBy: { version: "desc" },
    });

    return NextResponse.json({ agreements, signwellConfigured: isSignWellConfigured() });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch agreement" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/agreement/[partnerCode]
 * Admin sends (or resends) a partnership agreement to a partner.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { partnerCode: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const partnerEmail = body.email;
    const partnerName = body.name || "Partner";
    const partnerCode = params.partnerCode;

    // Cancel any existing pending agreement
    const pendingAgreement = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode, status: "pending" },
    });

    if (pendingAgreement?.signwellDocumentId) {
      await cancelDocument(pendingAgreement.signwellDocumentId);
      await prisma.partnershipAgreement.update({
        where: { id: pendingAgreement.id },
        data: { status: "not_sent" },
      });
    }

    // Determine next version
    const latestVersion = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latestVersion?.version || 0) + 1;

    // Send via SignWell
    const { documentId } = await sendForSigning({
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

    const agreement = await prisma.partnershipAgreement.create({
      data: {
        partnerCode,
        version: nextVersion,
        signwellDocumentId: documentId,
        status: "pending",
        sentDate: new Date(),
      },
    });

    return NextResponse.json({ agreement }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to send agreement" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/agreement/[partnerCode]
 * Admin manually updates agreement status (e.g., mark as signed for demo).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { partnerCode: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { agreementId, status } = body;

    const data: Record<string, any> = { status };
    if (status === "signed") {
      data.signedDate = new Date();
    }

    const agreement = await prisma.partnershipAgreement.update({
      where: { id: agreementId },
      data,
    });

    return NextResponse.json({ agreement });
  } catch {
    return NextResponse.json(
      { error: "Failed to update agreement" },
      { status: 500 }
    );
  }
}
