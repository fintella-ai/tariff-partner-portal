import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendgrid";
import { agreementSignedEmail } from "@/lib/email-templates/agreementSignedEmail";

// SignWell sends webhooks when documents are signed, viewed, etc.
// Webhook events: document_completed, document_viewed, document_expired
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verify webhook secret if configured
    const webhookSecret = process.env.SIGNWELL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get("x-signwell-signature");
      if (signature !== webhookSecret) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const { event, data } = body;

    if (event === "document_completed") {
      // Find the agreement by SignWell document ID and mark as signed
      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { signwellDocumentId: data.document_id },
      });

      if (agreement) {
        await prisma.partnershipAgreement.update({
          where: { id: agreement.id },
          data: {
            status: "signed",
            signedDate: new Date(),
            documentUrl: data.document_url || agreement.documentUrl,
          },
        });

        // Create a notification for the partner
        await prisma.notification.create({
          data: {
            recipientType: "partner",
            recipientId: agreement.partnerCode,
            type: "agreement_signed",
            title: "Partnership Agreement Signed",
            message: "Your partnership agreement has been signed and is now active. You can now submit deals.",
          },
        });

        // Send agreement-signed confirmation email.
        // Fire-and-forget — webhook must always return 2xx to SignWell so they
        // don't retry, and the email is a nice-to-have not a critical path.
        const partner = await prisma.partner
          .findUnique({
            where: { partnerCode: agreement.partnerCode },
            select: { firstName: true, email: true },
          })
          .catch(() => null);
        if (partner?.email) {
          const { subject, html, text } = agreementSignedEmail({
            firstName: partner.firstName || "there",
            partnerCode: agreement.partnerCode,
          });
          sendEmail({
            to: partner.email,
            subject,
            html,
            text,
            type: "agreement_signed",
            partnerCode: agreement.partnerCode,
          }).catch((e) => console.error("[signwell webhook] agreement email failed:", e));
        }
      }
    }

    if (event === "document_viewed") {
      // Track that the partner has viewed the document (no status change needed,
      // but useful for admin visibility)
      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { signwellDocumentId: data.document_id },
      });

      if (agreement && agreement.status === "pending") {
        // Still pending — partner has seen it but not signed yet
        // Could add a "viewed" timestamp in the future
      }
    }

    if (event === "document_expired") {
      const agreement = await prisma.partnershipAgreement.findFirst({
        where: { signwellDocumentId: data.document_id },
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
