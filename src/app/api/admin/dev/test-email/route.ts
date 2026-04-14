import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail, isSendGridConfigured } from "@/lib/sendgrid";

/**
 * POST /api/admin/dev/test-email
 *
 * Super-admin-only diagnostic. Sends a hardcoded test email through the
 * normal `sendEmail()` code path so the result lands in `EmailLog` exactly
 * the same way a real transactional send does. Use this from /admin/dev to
 * verify SENDGRID_API_KEY auth + From-domain authorization without having
 * to run a fresh signup or trigger a real partner workflow.
 *
 * Body: { to: string }
 * Returns: { ok, status, messageId, error?, sendgridConfigured }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  let body: { to?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!isValidEmail(to)) {
    return NextResponse.json(
      { error: "Valid `to` email address is required" },
      { status: 400 }
    );
  }

  const adminName = (session.user as any).name || session.user.email || "admin";
  const adminEmail = (session.user as any).email || "unknown";
  const sentAt = new Date().toISOString();

  const subject = "Fintella Partner Portal — SendGrid test send";

  const text =
    `Hello,\n\n` +
    `This is a diagnostic test email from the Fintella Partner Portal.\n\n` +
    `Triggered by: ${adminName} (${adminEmail})\n` +
    `Sent at:      ${sentAt}\n\n` +
    `If you received this in your inbox (not spam), the SendGrid integration ` +
    `is working end-to-end:\n\n` +
    `  - SENDGRID_API_KEY is valid (the request was authenticated)\n` +
    `  - The From domain (noreply@fintellaconsulting.com or similar) is ` +
    `authorized to send\n` +
    `  - DKIM/SPF/DMARC alignment is sufficient to clear inbox filters\n\n` +
    `If you DON'T see this email at all, check the EmailLog row in the admin ` +
    `Communication Log → Email tab — it will show the SendGrid response code ` +
    `and any error message.\n\n` +
    `— Fintella Partner Portal /admin/dev test-send`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>SendGrid test send</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:32px;">
    <div style="font-size:24px;font-weight:700;color:#c4a050;letter-spacing:1.5px;margin-bottom:4px;">FINTELLA</div>
    <div style="font-size:12px;color:#888;margin-bottom:24px;">Partner Portal — diagnostic test send</div>

    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:22px;color:#1a1a2e;margin:0 0 12px;">SendGrid test email</h1>
    <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 14px;">
      This is a diagnostic test email from the Fintella Partner Portal. If you received it in your inbox (not spam), the SendGrid integration is working end-to-end.
    </p>

    <div style="background:#f8f9fa;border-left:3px solid #c4a050;border-radius:6px;padding:14px 16px;margin:18px 0;font-size:13px;color:#444;line-height:1.6;">
      <strong style="color:#1a1a2e;">Triggered by:</strong> ${escapeHtml(adminName)} (${escapeHtml(adminEmail)})<br>
      <strong style="color:#1a1a2e;">Sent at:</strong> ${escapeHtml(sentAt)}
    </div>

    <p style="font-size:14px;color:#444;line-height:1.6;margin:14px 0;">What this proves if you see it:</p>
    <ul style="font-size:13px;color:#555;line-height:1.7;padding-left:20px;margin:0 0 16px;">
      <li><strong>SENDGRID_API_KEY</strong> is valid (the API call was authenticated)</li>
      <li>The From domain is authorized to send</li>
      <li>DKIM / SPF / DMARC alignment is sufficient to clear inbox filters</li>
    </ul>

    <p style="font-size:12px;color:#888;line-height:1.5;margin:24px 0 0;">
      If this didn't reach you at all, check the <code style="background:#f0f0f5;padding:2px 6px;border-radius:4px;color:#9a6e00;">EmailLog</code> row in the admin Communication Log → Email tab — it will show the SendGrid response code and any error message inline.
    </p>

    <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;font-size:11px;color:#aaa;">
      Fintella Partner Portal — /admin/dev diagnostic
    </div>
  </div>
</body>
</html>`;

  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    template: "test",
  });

  return NextResponse.json({
    ok: result.status === "sent" || result.status === "demo",
    status: result.status,
    messageId: result.messageId,
    error: result.error,
    sendgridConfigured: isSendGridConfigured(),
    sentAt,
    to,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Linear-time email shape check. Deliberately NOT a regex — the obvious
 * `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` formulation has nested repetition that
 * triggers CodeQL's `js/polynomial-redos` rule because it can backtrack
 * on adversarial inputs. This iterative version is O(n) regardless of
 * the input shape.
 *
 * Not intended as full RFC 5322 validation — just rejects obviously
 * malformed strings before we hand off to SendGrid (which does the
 * real validation server-side and returns a clear error message anyway).
 */
function isValidEmail(s: string): boolean {
  if (!s || s.length === 0 || s.length > 320) return false; // RFC 5321 max
  if (s.indexOf(" ") !== -1 || s.indexOf("\t") !== -1) return false;
  const at = s.indexOf("@");
  if (at <= 0) return false; // need at least one char before @
  if (at !== s.lastIndexOf("@")) return false; // exactly one @
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length === 0 || local.length > 64) return false;
  if (domain.length === 0 || domain.length > 253) return false;
  // Domain must contain at least one dot and the dot must not be at
  // either end (rejects `user@.com` and `user@example.`)
  const dot = domain.indexOf(".");
  if (dot <= 0 || dot === domain.length - 1) return false;
  return true;
}
