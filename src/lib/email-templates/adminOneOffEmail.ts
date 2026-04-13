/**
 * Admin one-off email — generic template for emails sent manually by an
 * admin from the partner detail page communications hub.
 *
 * Trigger: src/app/api/admin/communications/email/route.ts (POST handler)
 *          when an admin types a custom subject + body and clicks Send.
 *
 * Note: admin one-off sends BYPASS the partner.emailOptIn gate. The reasoning
 * is that an admin manually clicking Send is making an explicit decision to
 * communicate with this partner — the opt-in flag is for automated /
 * batched / marketing-style emails, not 1:1 admin outreach. The footer
 * disclosure tells the partner this was sent manually so the audit trail
 * is clear.
 */

import { renderEmail, escapeHtml } from "./_layout";
import { FIRM_SHORT } from "@/lib/constants";

export interface AdminOneOffEmailContext {
  /** Partner first name (for greeting) */
  firstName: string;
  /** Subject the admin typed in the UI */
  subject: string;
  /** Body the admin typed — plain text, will be paragraph-split for HTML */
  bodyText: string;
  /** Display name of the admin who sent it (for the signoff line) */
  sentByAdminName: string;
}

export function adminOneOffEmail(ctx: AdminOneOffEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  // Convert the plain-text body into a series of paragraphs for HTML.
  // We escape every paragraph so admin-typed content can never inject HTML.
  const paragraphs = ctx.bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const heading = ctx.subject;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(ctx.firstName)},</p>
    ${paragraphs}
    <p style="margin:0;">
      Best,<br>
      <strong>${escapeHtml(ctx.sentByAdminName)}</strong><br>
      ${escapeHtml(FIRM_SHORT)} Partner Team
    </p>
  `;

  const html = renderEmail({
    heading,
    bodyHtml,
    previewText: ctx.subject,
  });

  const text = [
    ctx.subject,
    ``,
    `Hi ${ctx.firstName},`,
    ``,
    ctx.bodyText.trim(),
    ``,
    `Best,`,
    ctx.sentByAdminName,
    `${FIRM_SHORT} Partner Team`,
  ].join("\n");

  return { subject: ctx.subject, html, text };
}
