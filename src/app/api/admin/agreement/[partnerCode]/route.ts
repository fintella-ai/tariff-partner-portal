import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  sendForSigning,
  cancelDocument,
  isSignWellConfigured,
  buildPartnerTemplateFields,
  resolveAgreementTemplateId,
} from "@/lib/signwell";
import { sendAgreementReadyEmail } from "@/lib/sendgrid";
import { sendAgreementReadySms } from "@/lib/twilio";
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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Co-signer URL lookup
    const action = req.nextUrl.searchParams.get("action");
    if (action === "cosigner_url") {
      const docId = req.nextUrl.searchParams.get("docId");
      if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

      const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
      const cosignerEmail = settings?.fintellaSignerEmail;
      if (!cosignerEmail) return NextResponse.json({ cosignerUrl: null });

      // Fetch document from SignWell and find the co-signer's URL
      const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY || "";
      if (!SIGNWELL_API_KEY) return NextResponse.json({ cosignerUrl: null });

      try {
        const docRes = await fetch(`https://www.signwell.com/api/v1/documents/${docId}`, {
          headers: { "X-Api-Key": SIGNWELL_API_KEY },
        });
        if (docRes.ok) {
          const doc = await docRes.json();
          // Find the co-signer's URL by email match
          const match = doc.recipients_with_urls?.find((r: any) => r.email === cosignerEmail);
          const cosignerUrl = match?.embedded_signing_url
            || doc.recipients_with_urls?.[1]?.embedded_signing_url
            || null;
          return NextResponse.json({ cosignerUrl });
        }
      } catch {}
      return NextResponse.json({ cosignerUrl: null });
    }

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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const partnerCode = params.partnerCode;

    // Load partner + profile so we can (a) derive name/email authoritatively
    // from the DB instead of trusting the request body, and (b) pre-fill the
    // SignWell template fields.
    const partner = await prisma.partner.findUnique({ where: { partnerCode } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    const profile = await prisma.partnerProfile.findUnique({ where: { partnerCode } });

    const partnerName =
      body.name ||
      [partner.firstName, partner.lastName].filter(Boolean).join(" ").trim() ||
      "Partner";
    const partnerEmail = body.email || partner.email || "";

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

    // Resolve the right template for this partner's commission rate. Admin
    // can override by passing an explicit `rate` (0.25/0.20/0.15/0.10) in
    // the body — useful when reissuing at a different rate without first
    // editing the partner record.
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    const effectiveRate =
      typeof body.rate === "number" ? body.rate : partner.commissionRate ?? 0.25;
    const { templateId, templateRate } = resolveAgreementTemplateId(effectiveRate, settings);

    // Build the SignWell template_fields array from partner data.
    const templateFields = buildPartnerTemplateFields({
      partnerCode,
      firstName: partner.firstName,
      lastName: partner.lastName,
      fullName: partnerName,
      email: partnerEmail,
      phone: partner.phone,
      mobilePhone: partner.mobilePhone,
      companyName: partner.companyName,
      title: (partner as any).title || null,
      tin: partner.tin,
      commissionRate: effectiveRate,
      street: profile?.street,
      street2: profile?.street2,
      city: profile?.city,
      state: profile?.state,
      zip: profile?.zip,
      country: profile?.country,
    });

    // Build the recipient list. Always include the partner as the primary
    // signer. If Fintella co-signer settings are configured, include them
    // as a second recipient so SignWell routes the document to them after
    // the partner signs — no manual countersign in the SignWell dashboard.
    const recipients = [
      {
        id: partnerCode,
        email: partnerEmail,
        name: partnerName,
        role: "Partner",
      },
    ];
    if (settings?.fintellaSignerEmail && settings?.fintellaSignerName) {
      recipients.push({
        id: "fintella_cosigner",
        email: settings.fintellaSignerEmail,
        name: settings.fintellaSignerName,
        role: settings.fintellaSignerPlaceholder || "Fintella",
      });
    }

    // Send via SignWell
    const { documentId, embeddedSigningUrl } = await sendForSigning({
      name: `${FIRM_SHORT} Partnership Agreement — ${partnerName}`,
      subject: `${FIRM_SHORT} Partnership Agreement`,
      message: `Hi ${partnerName}, please review and sign your ${FIRM_NAME} partnership agreement.`,
      recipients,
      templateId: templateId || undefined,
      templateFields,
    });

    const agreement = await prisma.partnershipAgreement.create({
      data: {
        partnerCode,
        version: nextVersion,
        signwellDocumentId: documentId,
        embeddedSigningUrl: embeddedSigningUrl || null,
        templateRate,
        templateId: templateId || null,
        status: "pending",
        sentDate: new Date(),
      },
    });

    // Notify the partner via notification bell
    await prisma.notification.create({
      data: {
        recipientType: "partner",
        recipientId: partnerCode,
        type: "document_request",
        title: "Partnership Agreement Sent",
        message: "Your partnership agreement is ready to sign. Go to Documents to review and sign.",
        link: "/dashboard/documents",
      },
    }).catch(() => {});

    // Phase 15a — fire transactional "agreement ready to sign" email.
    // Best-effort; never blocks the API response.
    sendAgreementReadyEmail(
      {
        partnerCode,
        email: partnerEmail,
        firstName: partner.firstName,
        lastName: partner.lastName,
      },
      embeddedSigningUrl || null
    ).catch((err) =>
      console.error("[AdminAgreement] agreement-ready email failed:", err)
    );

    // Phase 15b — parallel SMS notification (gated on partner.smsOptIn)
    sendAgreementReadySms({
      partnerCode,
      mobilePhone: partner.mobilePhone,
      smsOptIn: partner.smsOptIn,
      firstName: partner.firstName,
      lastName: partner.lastName,
    }).catch((err) =>
      console.error("[AdminAgreement] agreement-ready SMS failed:", err)
    );

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
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
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
