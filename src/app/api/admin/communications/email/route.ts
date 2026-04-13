import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendgrid";
import { adminOneOffEmail } from "@/lib/email-templates/adminOneOffEmail";

/**
 * POST /api/admin/communications/email
 *
 * Admin-triggered one-off email to a partner. Used by the "Send Email"
 * button on the partner detail page communication log.
 *
 * Permissions: any admin role (super_admin / admin / accounting /
 * partner_support) can send. partner_support exists specifically for this
 * kind of outreach so they're allowed. We don't restrict by role beyond
 * "must be authenticated as an admin user".
 *
 * Important: admin one-off sends BYPASS the partner.emailOptIn gate. The
 * reasoning is that an admin manually clicking Send is making an explicit
 * decision to communicate with this partner — opt-in is for automated /
 * batched sends (welcome, deal received, payout). The footer disclosure on
 * the email + the EmailLog row's sentByAdminId/Name fields make the audit
 * trail clear.
 *
 * Body: { partnerCode: string, subject: string, bodyText: string }
 * Returns: { success, status, errorMessage?, emailLogId? }
 */
export async function POST(req: NextRequest) {
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
    const { partnerCode, subject, bodyText } = body || {};

    if (!partnerCode || typeof partnerCode !== "string") {
      return NextResponse.json({ error: "partnerCode is required" }, { status: 400 });
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json({ error: "subject is required" }, { status: 400 });
    }
    if (!bodyText || typeof bodyText !== "string" || !bodyText.trim()) {
      return NextResponse.json({ error: "bodyText is required" }, { status: 400 });
    }
    if (subject.length > 200) {
      return NextResponse.json({ error: "subject must be 200 characters or less" }, { status: 400 });
    }
    if (bodyText.length > 10000) {
      return NextResponse.json({ error: "bodyText must be 10,000 characters or less" }, { status: 400 });
    }

    // Look up the partner to get email + first name
    const partner = await prisma.partner.findUnique({
      where: { partnerCode },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    if (!partner.email) {
      return NextResponse.json({ error: "Partner has no email address on file" }, { status: 400 });
    }

    // Look up the admin user for the audit fields
    const adminUser = await prisma.user.findUnique({
      where: { email: session.user.email || "" },
      select: { id: true, name: true, email: true },
    }).catch(() => null);
    const sentByAdminName = adminUser?.name || session.user.name || session.user.email || "Admin";

    const { subject: emailSubject, html, text } = adminOneOffEmail({
      firstName: partner.firstName || "there",
      subject: subject.trim(),
      bodyText: bodyText.trim(),
      sentByAdminName,
    });

    const result = await sendEmail({
      to: partner.email,
      subject: emailSubject,
      html,
      text,
      type: "admin_oneoff",
      partnerCode,
      bypassOptInGate: true, // explicit admin action, see comment above
      sentByAdminId: adminUser?.id || null,
      sentByAdminName,
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      messageId: result.messageId,
      errorMessage: result.errorMessage,
      emailLogId: result.emailLogId,
    });
  } catch (err: any) {
    console.error("[admin/communications/email] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to send email" },
      { status: 500 }
    );
  }
}
