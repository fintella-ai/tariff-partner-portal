import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail, isSendGridConfigured, getSendGridFromAddress } from "@/lib/sendgrid";
import { welcomeEmail } from "@/lib/email-templates/welcomeEmail";
import { agreementSignedEmail } from "@/lib/email-templates/agreementSignedEmail";
import { dealReceivedEmail } from "@/lib/email-templates/dealReceivedEmail";
import { payoutProcessedEmail } from "@/lib/email-templates/payoutProcessedEmail";
import { adminOneOffEmail } from "@/lib/email-templates/adminOneOffEmail";

/**
 * GET  /api/admin/dev/email-test
 *   Returns SendGrid configuration status (without leaking the API key) for
 *   display in the dev test harness UI.
 *
 * POST /api/admin/dev/email-test
 *   Super admin only. Renders one of the email templates with a sample
 *   context, then sends it via the sendEmail() module. Lets the admin verify
 *   that SendGrid is wired correctly post-deploy without going through the
 *   full signup → SignWell → webhook flow.
 *
 *   Body: { templateType: EmailType, toEmail: string, partnerCode?: string }
 *   Returns: { ok, status, errorMessage?, emailLogId?, fromAddress, isConfigured }
 *
 * Mirror the same role-gate + response shape as /api/admin/dev/webhook-test
 * so the frontend pattern matches.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  return NextResponse.json({
    isConfigured: isSendGridConfigured(),
    fromAddress: getSendGridFromAddress(),
  });
}

type TestTemplate =
  | "welcome"
  | "agreement_signed"
  | "deal_received"
  | "payout_processed"
  | "admin_oneoff";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { templateType, toEmail, partnerCode } = body || {};

    if (!toEmail || typeof toEmail !== "string" || !toEmail.includes("@")) {
      return NextResponse.json({ error: "toEmail is required and must be a valid email" }, { status: 400 });
    }

    const tpl = templateType as TestTemplate;
    const allowed: TestTemplate[] = [
      "welcome",
      "agreement_signed",
      "deal_received",
      "payout_processed",
      "admin_oneoff",
    ];
    if (!allowed.includes(tpl)) {
      return NextResponse.json(
        { error: `Invalid templateType. Use one of: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }

    // Build a sample context for the chosen template. These are intentionally
    // recognizable test values so it's obvious in the rendered email that
    // this came from the dev harness, not a real trigger.
    let rendered: { subject: string; html: string; text: string };
    switch (tpl) {
      case "welcome":
        rendered = welcomeEmail({
          firstName: "Test",
          partnerCode: partnerCode || "PTNTEST01",
          inviterName: "John Orlando",
          commissionRatePercent: 15,
          tierLabel: "L2",
        });
        break;
      case "agreement_signed":
        rendered = agreementSignedEmail({
          firstName: "Test",
          partnerCode: partnerCode || "PTNTEST01",
        });
        break;
      case "deal_received":
        rendered = dealReceivedEmail({
          firstName: "Test",
          dealId: "test-deal-id",
          dealName: "Acme Imports LLC (TEST)",
          clientEmail: "test@example.com",
          serviceOfInterest: "Tariff Refund Support",
          businessLocation: "Baltimore, MD",
        });
        break;
      case "payout_processed":
        rendered = payoutProcessedEmail({
          firstName: "Test",
          totalAmount: 4250.75,
          commissionCount: 3,
          batchId: "test-batch-id",
          periodLabel: "March 2026",
        });
        break;
      case "admin_oneoff":
        rendered = adminOneOffEmail({
          firstName: "Test",
          subject: "Test Email from Dev Harness",
          bodyText:
            "This is a test email from the /admin/dev/email-test harness.\n\nIf you're seeing this, SendGrid is wired up correctly and your domain authentication is working.",
          sentByAdminName: session.user.name || session.user.email || "Dev Test",
        });
        break;
    }

    const result = await sendEmail({
      to: toEmail,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: `*** This is a TEST email sent from /admin/dev/email-test ***\n\n${rendered.text}`,
      type: "test",
      partnerCode: partnerCode || null,
      // Test sends should always go through regardless of opt-in status —
      // this is the dev harness, not a marketing send.
      bypassOptInGate: true,
      sentByAdminId: null,
      sentByAdminName: session.user.name || session.user.email || "Dev Test",
    });

    return NextResponse.json({
      ok: result.success,
      status: result.status,
      messageId: result.messageId,
      errorMessage: result.errorMessage,
      emailLogId: result.emailLogId,
      fromAddress: getSendGridFromAddress(),
      isConfigured: isSendGridConfigured(),
      sentTo: toEmail,
      templateType: tpl,
    });
  } catch (err: any) {
    console.error("[email-test] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to send test email" },
      { status: 500 }
    );
  }
}
