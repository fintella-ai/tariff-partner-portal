import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAgreementSignedEmail } from "@/lib/sendgrid";
import { sendAgreementSignedSms } from "@/lib/twilio";
import { getCompletedPdfUrl, getCompletedDocumentFields, mapSignWellFieldsToPayoutData } from "@/lib/pandadoc";

/**
 * POST /api/pandadoc/webhook
 *
 * PandaDoc sends webhooks when documents are signed, viewed, completed, etc.
 * Events:
 *   - document_state_changed → fires on any status transition
 *   - recipient_completed → individual recipient signed
 *   - document_completed → all recipients signed, document finalized
 *
 * HARD RULE: Co-signer events are invisible. We check recipient email
 * against fintellaSignerEmail from PortalSettings.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Store webhook payload for debugging
    await prisma.webhookRequestLog.create({
      data: {
        direction: "incoming",
        method: "POST",
        path: "/api/pandadoc/webhook",
        body: JSON.stringify(body).slice(0, 10000),
        responseStatus: 200,
      },
    }).catch(() => {});

    // PandaDoc webhook payload structure:
    // [{ event: "document_state_changed", data: { id: "...", status: "document.completed", ... } }]
    // Can be an array of events or a single event object
    const events = Array.isArray(body) ? body : [body];

    for (const evt of events) {
      const eventType = evt.event;
      const docId = evt.data?.id;
      const docStatus = evt.data?.status;

      if (!docId) continue;

      // document_completed or document_state_changed to "document.completed"
      // → all recipients signed, agreement is fully executed
      if (
        eventType === "document_completed" ||
        (eventType === "document_state_changed" && docStatus === "document.completed")
      ) {
        const agreement = await prisma.partnershipAgreement.findFirst({
          where: { signwellDocumentId: docId },
        });

        if (agreement) {
          // Get completed PDF URL
          const completedPdfUrl =
            (docId ? await getCompletedPdfUrl(docId).catch(() => null) : null) || "";

          await prisma.partnershipAgreement.update({
            where: { id: agreement.id },
            data: {
              status: "signed",
              signedDate: new Date(),
              documentUrl: completedPdfUrl || agreement.documentUrl,
            },
          });

          // Store completed agreement as a Document row for "My Documents"
          const uploadedBy = `PandaDoc:${docId || agreement.id}`;
          const existingDoc = await prisma.document.findFirst({
            where: { partnerCode: agreement.partnerCode, uploadedBy },
            select: { id: true },
          });
          if (existingDoc) {
            await prisma.document.update({
              where: { id: existingDoc.id },
              data: { fileUrl: completedPdfUrl, status: "approved" },
            }).catch(() => {});
          } else {
            await prisma.document.create({
              data: {
                partnerCode: agreement.partnerCode,
                docType: "agreement",
                fileName: `Partnership Agreement v${agreement.version} — Signed ${new Date().toLocaleDateString("en-US")}`,
                fileUrl: completedPdfUrl,
                status: "approved",
                uploadedBy,
              },
            }).catch(() => {});
          }

          // Create a notification for the partner
          await prisma.notification.create({
            data: {
              recipientType: "partner",
              recipientId: agreement.partnerCode,
              type: "agreement_signed",
              title: "Partnership Agreement Signed",
              message: "Your partnership agreement has been signed and is now active. You can now submit deals.",
              link: "/dashboard/documents",
            },
          });

          const partner = await prisma.partner.findUnique({
            where: { partnerCode: agreement.partnerCode },
            select: {
              partnerCode: true,
              email: true,
              firstName: true,
              lastName: true,
              mobilePhone: true,
              smsOptIn: true,
              status: true,
            },
          }).catch(() => null);

          if (!partner || partner.partnerCode !== agreement.partnerCode) {
            console.error(`[pandadoc] document ${docId} partner mismatch — agreement.partnerCode=${agreement.partnerCode}`);
            continue;
          }

          // Activate the partner if they were pending
          if (partner && partner.status === "pending") {
            await prisma.partner.update({
              where: { partnerCode: agreement.partnerCode },
              data: { status: "active" },
            });
          }

          // Fire workflow trigger for partner.activated
          if (partner && partner.status === "pending") {
            import("@/lib/workflow-engine").then(({ fireWorkflowTrigger }) =>
              fireWorkflowTrigger("partner.activated", { partner })
            ).catch(() => {});
          }

          // Extract payout fields from completed document
          getCompletedDocumentFields(docId).then(async (fields) => {
            if (!fields || Object.keys(fields).length === 0) return;
            const { profileData, partnerData } = mapSignWellFieldsToPayoutData(fields);
            if (Object.keys(partnerData).length > 0) {
              await prisma.partner.update({
                where: { partnerCode: agreement.partnerCode },
                data: partnerData,
              }).catch(() => {});
            }
            if (Object.keys(profileData).length > 0) {
              profileData.payoutLockedAt = new Date();
              profileData.payoutLockedBy = "agreement";
              await prisma.partnerProfile.upsert({
                where: { partnerCode: agreement.partnerCode },
                update: profileData,
                create: { partnerCode: agreement.partnerCode, ...profileData },
              }).catch((err: any) => console.error("[pandadoc] payout profile save failed:", err));
            }
          }).catch(() => {});

          // Fire transactional "account active" email + SMS
          if (partner?.email) {
            sendAgreementSignedEmail({
              partnerCode: partner.partnerCode,
              email: partner.email,
              firstName: partner.firstName,
              lastName: partner.lastName,
            }).catch((err) =>
              console.error("[PandaDocWebhook] agreement-signed email failed:", err)
            );
          }
          if (partner) {
            sendAgreementSignedSms({
              partnerCode: partner.partnerCode,
              mobilePhone: partner.mobilePhone,
              smsOptIn: partner.smsOptIn,
              firstName: partner.firstName,
              lastName: partner.lastName,
            }).catch((err) =>
              console.error("[PandaDocWebhook] agreement-signed SMS failed:", err)
            );
          }
        }
      }

      // recipient_completed → individual recipient signed
      // HARD RULE: Co-signer events are invisible
      if (eventType === "recipient_completed") {
        const recipientEmail = evt.data?.recipient?.email || "";
        const settings = await prisma.portalSettings.findUnique({
          where: { id: "global" },
          select: { fintellaSignerEmail: true },
        });
        const cosignerEmail = settings?.fintellaSignerEmail || "";
        const isCosigner = cosignerEmail && recipientEmail.toLowerCase() === cosignerEmail.toLowerCase();

        const agreement = await prisma.partnershipAgreement.findFirst({
          where: { signwellDocumentId: docId },
        });

        if (agreement && agreement.status === "pending" && !isCosigner) {
          // Partner has signed — update to partner_signed
          await prisma.partnershipAgreement.update({
            where: { id: agreement.id },
            data: { status: "partner_signed" },
          });

          // Notify the partner
          await prisma.notification.create({
            data: {
              recipientType: "partner",
              recipientId: agreement.partnerCode,
              type: "agreement_signed",
              title: "Your Signature Complete",
              message: "Your partnership agreement signature is complete. Awaiting Fintella co-signer to finalize.",
              link: "/dashboard/documents",
            },
          }).catch(() => {});

          // Notify ALL admins to co-sign
          const partnerRow = await prisma.partner.findUnique({
            where: { partnerCode: agreement.partnerCode },
            select: { id: true },
          });
          const link = partnerRow
            ? `/admin/partners/${partnerRow.id}?tab=documents`
            : `/admin/partners?search=${encodeURIComponent(agreement.partnerCode)}`;
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
                title: "Partner Agreement Ready for Co-sign",
                message: `Partner ${agreement.partnerCode} has signed their agreement. Click to co-sign and complete.`,
                link,
              },
            }).catch(() => {});
          }
        }
      }

      // document_state_changed to "document.viewed" — partner viewed
      if (eventType === "document_state_changed" && docStatus === "document.viewed") {
        // HARD RULE: Only set "viewed" if the PARTNER viewed, not the co-signer
        const viewerEmail = evt.data?.recipient?.email || "";
        const viewSettings = await prisma.portalSettings.findUnique({
          where: { id: "global" },
          select: { fintellaSignerEmail: true },
        });
        const isCosignerView = viewSettings?.fintellaSignerEmail &&
          viewerEmail.toLowerCase() === viewSettings.fintellaSignerEmail.toLowerCase();

        const agreement = await prisma.partnershipAgreement.findFirst({
          where: { signwellDocumentId: docId },
        });

        if (agreement && agreement.status === "pending" && !isCosignerView) {
          await prisma.partnershipAgreement.update({
            where: { id: agreement.id },
            data: { status: "viewed", viewedAt: new Date() },
          });
        }
      }

      // document_state_changed to "document.voided" — document voided/expired
      if (
        eventType === "document_state_changed" &&
        (docStatus === "document.voided" || docStatus === "document.expired")
      ) {
        const agreement = await prisma.partnershipAgreement.findFirst({
          where: { signwellDocumentId: docId },
        });

        if (agreement) {
          await prisma.partnershipAgreement.update({
            where: { id: agreement.id },
            data: { status: "not_sent" },
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
