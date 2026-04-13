/**
 * Deal received email — sent when the Frost Law referral webhook attributes
 * a new deal to a partner via utm_content tracking.
 *
 * Trigger: src/app/api/webhook/referral/route.ts after deal.create(),
 *          inside the existing `if (partnerCode && partnerCode !== "UNATTRIBUTED")`
 *          notification block.
 */

import { renderEmail, escapeHtml } from "./_layout";
import { FIRM_SHORT } from "@/lib/constants";

export interface DealReceivedEmailContext {
  /** Partner first name (for the greeting) */
  firstName: string;
  /** Internal deal ID — used to construct the deep link */
  dealId: string;
  /** Resolved deal name (legal entity, or "Firstname Lastname") */
  dealName: string;
  /** Optional client email for context */
  clientEmail?: string | null;
  /** Optional service of interest (e.g. "Tariff Refund Support") */
  serviceOfInterest?: string | null;
  /** Optional business location for context */
  businessLocation?: string | null;
}

export function dealReceivedEmail(ctx: DealReceivedEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `New referral received: ${ctx.dealName}`;

  const heading = "New referral received";
  const subheading = "A lead came in through your link";

  // Build a small details list — only show fields that have values.
  const detailRows: string[] = [];
  detailRows.push(
    `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Lead</td><td style="padding:6px 0;color:#1a1a2e;font-size:13px;font-weight:600;">${escapeHtml(ctx.dealName)}</td></tr>`
  );
  if (ctx.serviceOfInterest) {
    detailRows.push(
      `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Service</td><td style="padding:6px 0;color:#1a1a2e;font-size:13px;">${escapeHtml(ctx.serviceOfInterest)}</td></tr>`
    );
  }
  if (ctx.clientEmail) {
    detailRows.push(
      `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Contact</td><td style="padding:6px 0;color:#1a1a2e;font-size:13px;">${escapeHtml(ctx.clientEmail)}</td></tr>`
    );
  }
  if (ctx.businessLocation) {
    detailRows.push(
      `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Location</td><td style="padding:6px 0;color:#1a1a2e;font-size:13px;">${escapeHtml(ctx.businessLocation)}</td></tr>`
    );
  }

  const detailsTable = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0 24px;background:#fdf9ed;border:1px solid #f3ead0;border-radius:8px;padding:16px 20px;">
      <tr><td>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          ${detailRows.join("")}
        </table>
      </td></tr>
    </table>
  `;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(ctx.firstName)},</p>
    <p style="margin:0 0 16px;">
      A new referral has come in through your link and has been added to
      your deal pipeline. Here are the details:
    </p>
    ${detailsTable}
    <p style="margin:0 0 16px;">
      The lead is now in <strong>New Lead</strong> stage. Our intake team will
      reach out shortly to schedule a consultation. You can track this deal's
      progress in real-time from your portal dashboard.
    </p>
    <p style="margin:0 0 16px;">
      Nice work — keep them coming.
    </p>
    <p style="margin:0;">
      <strong>The ${escapeHtml(FIRM_SHORT)} Team</strong>
    </p>
  `;

  const html = renderEmail({
    heading,
    subheading,
    bodyHtml,
    cta: { label: "View Deal in Portal", url: `https://fintella.partners/dashboard/deals?deal=${encodeURIComponent(ctx.dealId)}` },
    previewText: `${ctx.dealName} just came through your referral link.`,
  });

  const textLines = [
    `New referral received: ${ctx.dealName}`,
    ``,
    `Hi ${ctx.firstName},`,
    ``,
    `A new lead came in through your referral link:`,
    ``,
    `  Lead:    ${ctx.dealName}`,
  ];
  if (ctx.serviceOfInterest) textLines.push(`  Service: ${ctx.serviceOfInterest}`);
  if (ctx.clientEmail) textLines.push(`  Contact: ${ctx.clientEmail}`);
  if (ctx.businessLocation) textLines.push(`  Location: ${ctx.businessLocation}`);
  textLines.push(
    ``,
    `The lead is in New Lead stage. Our intake team will reach out shortly to schedule a consultation.`,
    ``,
    `Track this deal: https://fintella.partners/dashboard/deals?deal=${encodeURIComponent(ctx.dealId)}`,
    ``,
    `Nice work — keep them coming.`,
    ``,
    `The ${FIRM_SHORT} Team`
  );

  return { subject, html, text: textLines.join("\n") };
}
