import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/partner/upload-agreement
 * L1 partner uploads a signed agreement for one of their L2/L3 downline partners.
 * Agreement goes into "under_review" status — admin must approve to activate.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uploaderCode = (session.user as any).partnerCode;
  if (!uploaderCode) return NextResponse.json({ error: "Not a partner" }, { status: 403 });

  try {
    const body = await req.json();
    const { targetPartnerCode, fileName, fileData } = body;

    if (!targetPartnerCode || !fileName) {
      return NextResponse.json({ error: "targetPartnerCode and fileName are required" }, { status: 400 });
    }

    // Verify the target partner exists and is somewhere in the uploader's
    // downline — direct child (L2 under L1) OR grandchild (L3 under L2
    // under L1). Anything deeper is rejected.
    const targetPartner = await prisma.partner.findUnique({
      where: { partnerCode: targetPartnerCode },
    });

    if (!targetPartner) {
      return NextResponse.json({ error: "Target partner not found" }, { status: 404 });
    }

    let authorized = targetPartner.referredByPartnerCode === uploaderCode;
    if (!authorized && targetPartner.referredByPartnerCode) {
      const parent = await prisma.partner.findUnique({
        where: { partnerCode: targetPartner.referredByPartnerCode },
        select: { referredByPartnerCode: true },
      });
      if (parent?.referredByPartnerCode === uploaderCode) authorized = true;
    }
    if (!authorized) {
      return NextResponse.json({ error: "You can only upload agreements for partners in your downline" }, { status: 403 });
    }

    // Create document record with "under_review" status
    const document = await prisma.document.create({
      data: {
        partnerCode: targetPartnerCode,
        docType: "agreement",
        fileName,
        fileUrl: fileData || "",
        status: "under_review",
        uploadedBy: uploaderCode,
      },
    });

    // Create partnership agreement record
    const latestAgreement = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode: targetPartnerCode },
      orderBy: { version: "desc" },
    });

    await prisma.partnershipAgreement.create({
      data: {
        partnerCode: targetPartnerCode,
        version: (latestAgreement?.version || 0) + 1,
        templateRate: targetPartner.commissionRate,
        status: "under_review",
        sentDate: new Date(),
        documentUrl: fileData || null,
      },
    });

    // Update partner status to reflect under review
    await prisma.partner.update({
      where: { partnerCode: targetPartnerCode },
      data: { status: "under_review" },
    });

    return NextResponse.json({
      success: true,
      document,
      message: `Agreement uploaded for ${targetPartner.firstName} ${targetPartner.lastName}. It will be reviewed by an admin before activation.`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("[Partner Upload Agreement] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to upload agreement" }, { status: 500 });
  }
}
