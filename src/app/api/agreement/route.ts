import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  sendForSigning,
  getEmbeddedSigningUrl,
  isSignWellConfigured,
  buildPartnerTemplateFields,
  resolveAgreementTemplateId,
} from "@/lib/signwell";
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
    let agreement = await prisma.partnershipAgreement.findFirst({
      where: { partnerCode },
      orderBy: { version: "desc" },
    });

    // Auto-reconcile: if agreement is under_review but there's an approved document, fix it.
    // Skip SignWell agreements — those transition only via document_completed webhook.
    if (agreement && !agreement.signwellDocumentId && (agreement.status === "under_review" || agreement.status === "pending")) {
      const approvedDoc = await prisma.document.findFirst({
        where: { partnerCode, docType: "agreement", status: "approved" },
        orderBy: { createdAt: "desc" },
      });
      if (approvedDoc) {
        agreement = await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: { status: "approved", signedDate: agreement.signedDate || new Date() },
        });
      }
    }

    // For pending agreements, try to get the embedded signing URL.
    // First check the DB, then fetch fresh from SignWell if missing.
    const partnerEmail = (session.user as any).email || null;
    let embeddedSigningUrl = agreement?.embeddedSigningUrl || null;
    if (agreement?.status === "pending" && !embeddedSigningUrl && agreement.signwellDocumentId) {
      embeddedSigningUrl = await getEmbeddedSigningUrl(
        agreement.signwellDocumentId,
        partnerEmail
      );
      // Persist it so we don't re-fetch every page load
      if (embeddedSigningUrl) {
        await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: { embeddedSigningUrl },
        }).catch(() => {});
      }
    }

    // Also return Partner.status so the partner-side gates at
    // /dashboard/submit-client and /dashboard/referral-links can enforce
    // "agreement signed AND partner active" as a defense-in-depth check.
    // Post-#76 the SignWell webhook flips Partner.status automatically, so
    // in the happy path both fields converge — but this guards against any
    // future path that marks an agreement signed without the webhook firing.
    const [partnerRow, dealCount] = await Promise.all([
      prisma.partner.findUnique({
        where: { partnerCode },
        select: { status: true },
      }),
      prisma.deal.count({ where: { partnerCode } }),
    ]);

    return NextResponse.json({
      dealCount,
      agreement: agreement
        ? {
            id: agreement.id,
            status: agreement.status,
            version: agreement.version,
            sentDate: agreement.sentDate,
            signedDate: agreement.signedDate,
            documentUrl: agreement.documentUrl,
            embeddedSigningUrl,
            signwellDocumentId: agreement.signwellDocumentId || null,
            signwellConfigured: isSignWellConfigured(),
          }
        : null,
      partnerStatus: partnerRow?.status || null,
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
      where: { partnerCode, status: { in: ["pending", "signed", "approved"] } },
      orderBy: { version: "desc" },
    });

    if (existing?.status === "signed" || existing?.status === "approved") {
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

    // Look up partner record + profile so we can pre-fill the template.
    const partner = await prisma.partner.findUnique({ where: { partnerCode } });
    const profile = await prisma.partnerProfile.findUnique({ where: { partnerCode } });

    // Resolve the right template for this partner's commission rate.
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    const { templateId, templateRate } = resolveAgreementTemplateId(
      partner?.commissionRate ?? 0.25,
      settings
    );

    // Build the SignWell template_fields array from partner data.
    const templateFields = buildPartnerTemplateFields({
      partnerCode,
      firstName: partner?.firstName,
      lastName: partner?.lastName,
      fullName: partnerName,
      email: partner?.email || partnerEmail,
      phone: partner?.phone,
      mobilePhone: partner?.mobilePhone,
      companyName: partner?.companyName,
      tin: partner?.tin,
      commissionRate: partner?.commissionRate ?? templateRate,
      street: profile?.street,
      street2: profile?.street2,
      city: profile?.city,
      state: profile?.state,
      zip: profile?.zip,
      country: profile?.country,
    });

    // SignWell templates define 2 placeholders: the Partner + a Fintella
    // cosigner. Mirror the admin send flow — append the firm signer when
    // PortalSettings has one configured. Without this, SignWell 422s with
    // "missing_placeholder_names: fintella".
    const recipients: Array<{ id: string; email: string; name: string; role: string }> = [
      {
        id: partnerCode,
        email: partnerEmail || "",
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

    // Send via SignWell (with embedded signing enabled)
    const { documentId, embeddedSigningUrl, cosignerSigningUrl } = await sendForSigning({
      name: `${FIRM_SHORT} Partnership Agreement — ${partnerName}`,
      subject: `${FIRM_SHORT} Partnership Agreement`,
      message: `Hi ${partnerName}, please review and sign your ${FIRM_NAME} partnership agreement.`,
      recipients,
      templateId: templateId || undefined,
      templateFields,
    });

    // Create agreement record
    const agreement = await prisma.partnershipAgreement.create({
      data: {
        partnerCode,
        version: nextVersion,
        signwellDocumentId: documentId,
        embeddedSigningUrl: embeddedSigningUrl || null,
        cosignerSigningUrl: cosignerSigningUrl || null,
        templateRate,
        templateId: templateId || null,
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
