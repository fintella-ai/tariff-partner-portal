import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  sendForSigning,
  cancelDocument,
  isSignWellConfigured,
  buildPartnerTemplateFields,
  resolveAgreementTemplateId,
  getCompletedDocumentFields,
  mapSignWellFieldsToPayoutData,
} from "@/lib/signwell";
import { sendAgreementReadyEmail, sendAgreementReminderEmail } from "@/lib/sendgrid";
import { sendAgreementReadySms } from "@/lib/twilio";
import { getEmbeddedSigningUrl } from "@/lib/signwell";
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

    // Refresh: query SignWell for actual document status + co-sign URL
    if (action === "refresh") {
      const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY || "";
      if (!SIGNWELL_API_KEY) return NextResponse.json({ error: "SignWell not configured" }, { status: 400 });

      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { partnerCode: params.partnerCode, status: { in: ["pending", "viewed", "partner_signed"] } },
        orderBy: { version: "desc" },
      });
      if (!agreement?.signwellDocumentId) return NextResponse.json({ error: "No active agreement found" }, { status: 404 });

      const docRes = await fetch(`https://www.signwell.com/api/v1/documents/${agreement.signwellDocumentId}`, {
        headers: { "X-Api-Key": SIGNWELL_API_KEY },
      });
      if (!docRes.ok) return NextResponse.json({ error: "Failed to fetch from SignWell" }, { status: 502 });

      const doc = await docRes.json();
      const recipients = doc.recipients || [];
      const allSigned = recipients.every((r: any) => r.status === "completed");
      const partnerSigned = recipients.length > 0 && recipients[0]?.status === "completed";

      let newStatus = agreement.status;
      if (allSigned && doc.status === "completed") {
        newStatus = "signed";
      } else if (partnerSigned) {
        newStatus = "partner_signed";
      } else if (doc.status === "viewed" || recipients.some((r: any) => r.status === "viewed")) {
        newStatus = "viewed";
      }

      const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
      const cosignerEmail = settings?.fintellaSignerEmail;
      const cosignerRecipient = doc.recipients_with_urls?.find((r: any) => r.email === cosignerEmail)
        || doc.recipients_with_urls?.[1];
      const cosignerUrl = cosignerRecipient?.embedded_signing_url || null;

      if (newStatus !== agreement.status || cosignerUrl) {
        await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: {
            status: newStatus,
            ...(cosignerUrl ? { cosignerSigningUrl: cosignerUrl } : {}),
          },
        });

        // Create admin notification + task when partner signed (catches missed webhooks)
        if (newStatus === "partner_signed" && agreement.status !== "partner_signed") {
          const partnerRow = await prisma.partner.findUnique({
            where: { partnerCode: params.partnerCode },
            select: { id: true, firstName: true, lastName: true },
          });
          const link = partnerRow
            ? `/admin/partners/${partnerRow.id}?tab=documents`
            : `/admin/partners?search=${encodeURIComponent(params.partnerCode)}`;
          const partnerName = partnerRow ? `${partnerRow.firstName} ${partnerRow.lastName}` : params.partnerCode;

          const admins = await prisma.user.findMany({
            where: { role: { in: ["super_admin", "admin"] } },
            select: { email: true },
          });
          for (const admin of admins) {
            await prisma.notification.create({
              data: {
                recipientType: "admin",
                recipientId: admin.email,
                type: "document_request",
                title: "Agreement Ready for Co-sign",
                message: `${partnerName} has signed their partnership agreement. Co-sign to complete.`,
                link,
              },
            }).catch(() => {});
          }
        }
      }

      return NextResponse.json({
        status: newStatus,
        cosignerUrl,
        signwellStatus: doc.status,
        recipients: recipients.map((r: any) => ({ name: r.name, email: r.email, status: r.status })),
      });
    }

    // Resend agreement reminder: re-fire the agreement email/SMS without creating a new agreement
    if (action === "remind") {
      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { partnerCode: params.partnerCode, status: { in: ["pending", "viewed", "partner_signed"] } },
        orderBy: { version: "desc" },
      });
      if (!agreement) {
        return NextResponse.json({ error: "No active agreement to remind about" }, { status: 404 });
      }

      const partner = await prisma.partner.findUnique({
        where: { partnerCode: params.partnerCode },
        select: { email: true, firstName: true, lastName: true, mobilePhone: true, smsOptIn: true, partnerCode: true },
      });
      if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

      // Get the signing URL — either from the stored agreement or re-fetch from SignWell
      let signingUrl = agreement.embeddedSigningUrl || "";
      if (!signingUrl && agreement.signwellDocumentId) {
        signingUrl = await getEmbeddedSigningUrl(agreement.signwellDocumentId, partner.email).catch(() => null) || "";
      }

      const daysSinceSent = agreement.sentDate
        ? Math.floor((Date.now() - new Date(agreement.sentDate).getTime()) / 86400000)
        : 0;

      const emailResult = await sendAgreementReminderEmail({
        toEmail: partner.email,
        toName: `${partner.firstName} ${partner.lastName}`,
        signingUrl,
        daysSinceSent,
      }).catch(() => null);

      // Also resend SMS
      const { sendAgreementReadySms: smsReminder } = await import("@/lib/twilio");
      smsReminder({
        partnerCode: partner.partnerCode,
        mobilePhone: partner.mobilePhone,
        smsOptIn: partner.smsOptIn,
        firstName: partner.firstName,
        lastName: partner.lastName,
      }).catch(() => {});

      return NextResponse.json({
        ok: true,
        emailStatus: emailResult?.status || "skipped",
        signingUrl: signingUrl || null,
        daysSinceSent,
      });
    }

    // Sync payout: re-extract fields from signed agreement and populate PartnerProfile
    if (action === "sync_payout") {
      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { partnerCode: params.partnerCode, status: { in: ["signed", "approved"] } },
        orderBy: { version: "desc" },
      });
      if (!agreement?.signwellDocumentId) {
        return NextResponse.json({ error: "No signed agreement with SignWell document ID" }, { status: 404 });
      }

      const fields = await getCompletedDocumentFields(agreement.signwellDocumentId);
      if (!fields || Object.keys(fields).length === 0) {
        return NextResponse.json({ error: "No fields returned from SignWell — check template api_ids", extractedFields: {} }, { status: 404 });
      }

      const { profileData, partnerData } = mapSignWellFieldsToPayoutData(fields);

      if (Object.keys(partnerData).length > 0) {
        await prisma.partner.update({
          where: { partnerCode: params.partnerCode },
          data: partnerData,
        });
      }

      let saved = 0;
      if (Object.keys(profileData).length > 0) {
        profileData.payoutLockedAt = new Date();
        profileData.payoutLockedBy = "agreement";
        await prisma.partnerProfile.upsert({
          where: { partnerCode: params.partnerCode },
          update: profileData,
          create: { partnerCode: params.partnerCode, ...profileData },
        });
        saved = Object.keys(profileData).length;
      }

      return NextResponse.json({
        ok: true,
        saved,
        extractedFields: fields,
        mappedProfile: profileData,
        mappedPartner: partnerData,
      });
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

    // Void/cancel any existing active agreements (pending, viewed, signed, approved)
    const existingAgreements = await prisma.partnershipAgreement.findMany({
      where: { partnerCode, status: { in: ["pending", "viewed", "signed", "approved"] } },
    });

    for (const existing of existingAgreements) {
      if (existing.signwellDocumentId) {
        await cancelDocument(existing.signwellDocumentId).catch(() => {});
      }
      await prisma.partnershipAgreement.update({
        where: { id: existing.id },
        data: { status: "voided" },
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
    const { documentId, embeddedSigningUrl, cosignerSigningUrl } = await sendForSigning({
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
        cosignerSigningUrl: cosignerSigningUrl || null,
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

    // Fire workflow trigger — admins can chain extra actions (slack ping,
    // add to onboarding channel, schedule a reminder). The direct email
    // below still fires; workflow actions are additive.
    import("@/lib/workflow-engine").then(({ fireWorkflowTrigger }) =>
      fireWorkflowTrigger("partner.agreement_sent", {
        partner,
        signingUrl: embeddedSigningUrl || null,
        agreementId: agreement?.id || null,
      })
    ).catch(() => {});

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
