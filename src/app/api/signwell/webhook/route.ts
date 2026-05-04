import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAgreementSignedEmail } from "@/lib/sendgrid";
import { sendAgreementSignedSms } from "@/lib/twilio";
import { getCompletedPdfUrl, getCompletedDocumentFields, mapSignWellFieldsToPayoutData } from "@/lib/signwell";
import crypto from "crypto";

// SignWell sends webhooks when documents are signed, viewed, etc.
// Webhook events: document_completed, document_viewed, document_expired
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verify webhook secret if configured (timing-safe comparison)
    const webhookSecret = process.env.SIGNWELL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get("x-signwell-signature") || "";
      try {
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(webhookSecret))) {
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Store webhook payload for debugging
    await prisma.webhookRequestLog.create({
      data: {
        direction: "incoming",
        method: "POST",
        path: "/api/signwell/webhook",
        body: JSON.stringify(body).slice(0, 10000),
        responseStatus: 200,
      },
    }).catch(() => {});

    // SignWell sends: { event: { type: "document_completed", ... }, data: { object: { id: "..." } } }
    const eventType = typeof body.event === "string" ? body.event : body.event?.type;
    const docId = body.data?.object?.id || body.data?.document_id || body.data?.id || body.document_id;

    if (eventType === "document_completed") {
      // Find the agreement by SignWell document ID and mark as signed
      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { signwellDocumentId: docId },
      });

      if (agreement) {
        // Pull the completed PDF URL from the webhook body when present;
        // otherwise call SignWell's /completed_pdf?url_only endpoint
        // (developers.signwell.com/reference/getcompletedpdf). Includes
        // the audit page so we have the legally-defensible trail.
        const bodyPdfUrl =
          body.data?.object?.completed_pdf_url ||
          body.data?.object?.original_file_url ||
          body.data?.document_url ||
          "";
        const completedPdfUrl =
          bodyPdfUrl ||
          (docId ? await getCompletedPdfUrl(docId).catch(() => null) : null) ||
          "";

        await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: {
            status: "signed",
            signedDate: new Date(),
            documentUrl: completedPdfUrl || agreement.documentUrl,
          },
        });

        // Store completed agreement as a Document so it shows up in the
        // partner's "My Documents" and the admin's documents log alongside
        // every other uploaded doc. Dedup via `uploadedBy = SignWell:<docId>`
        // so SignWell webhook retries don't create duplicates.
        const uploadedBy = `SignWell:${docId || agreement.id}`;
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

        // Fetch the partner so we can both (a) activate them if they were
        // still pending and (b) pass their contact info to the post-sign
        // notifications below.
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
          console.error(`[signwell] document ${docId} partner mismatch — agreement.partnerCode=${agreement.partnerCode}`);
          return NextResponse.json({ received: true, warning: "partner mismatch" });
        }

        // Activate the partner if they were pending. This is the
        // CLAUDE.md-documented "SignWell webhook marks agreement as
        // signed → partner becomes active" step. Without it, Partner.status
        // stays "pending" forever even after the agreement is signed,
        // which breaks every code path that filters on status==="active"
        // (admin views, chat routing, enterprise override calculations).
        // Deliberately NOT wrapped in try/catch — if this DB write fails,
        // we want the webhook to 500 so SignWell retries.
        if (partner && partner.status === "pending") {
          await prisma.partner.update({
            where: { partnerCode: agreement.partnerCode },
            data: { status: "active" },
          });
        }

        // Fire workflow trigger for partner.activated (fire-and-forget)
        if (partner && partner.status === "pending") {
          import("@/lib/workflow-engine").then(({ fireWorkflowTrigger }) =>
            fireWorkflowTrigger("partner.activated", { partner })
          ).catch(() => {});
        }

        // Extract payout fields from completed document and lock profile
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
            }).catch((err) => console.error("[signwell] payout profile save failed:", err));
          }
        }).catch(() => {});

        // Phase 15a + 15b — fire transactional "account active" email + SMS.
        // Best-effort; webhook should still 200 even if SendGrid/Twilio is down.
        if (partner?.email) {
          sendAgreementSignedEmail({
            partnerCode: partner.partnerCode,
            email: partner.email,
            firstName: partner.firstName,
            lastName: partner.lastName,
          }).catch((err) =>
            console.error("[SignWellWebhook] agreement-signed email failed:", err)
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
            console.error("[SignWellWebhook] agreement-signed SMS failed:", err)
          );
        }
      }
    }

    // Individual signer completed — partner signed but co-signer hasn't yet
    // SignWell may use: document_signed, recipient_completed, document_recipient_completed
    const isPartialSign = ["document_signed", "recipient_completed", "document_recipient_completed", "recipient_signed"].includes(eventType || "");
    if (isPartialSign) {
      // Check if this is the co-signer (Fintella auto-signer), not the partner
      const recipientEmail = body.data?.object?.email || body.data?.recipient?.email || "";
      const settings = await prisma.portalSettings.findUnique({ where: { id: "global" }, select: { fintellaSignerEmail: true } });
      const cosignerEmail = settings?.fintellaSignerEmail || "";
      const isCosigner = cosignerEmail && recipientEmail.toLowerCase() === cosignerEmail.toLowerCase();

      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { signwellDocumentId: docId },
      });

      if (agreement && agreement.status === "pending" && !isCosigner) {
        // Partner has signed — update to partner_signed so the UI
        // shows "Your Signature Complete" + "Awaiting Co-sign"
        await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: { status: "partner_signed" },
        });

        // Notify the partner that their part is done
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

        // Notify ALL admins to co-sign. Link by the partner's Prisma id
        // (the segment the `/admin/partners/[id]` route expects) — earlier
        // versions used a synthesized `p-{code}` shape that 404'd.
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

    if (eventType === "document_viewed") {
      // HARD RULE: Only set "viewed" if the PARTNER viewed, not the co-signer
      const viewerEmail = body.data?.object?.email || body.data?.recipient?.email || "";
      const viewSettings = await prisma.portalSettings.findUnique({ where: { id: "global" }, select: { fintellaSignerEmail: true } });
      const isCosignerView = viewSettings?.fintellaSignerEmail && viewerEmail.toLowerCase() === viewSettings.fintellaSignerEmail.toLowerCase();

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

    if (eventType === "document_expired") {
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

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
