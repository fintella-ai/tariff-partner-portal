/**
 * Payout processed email — sent when an admin processes a payout batch via
 * /api/admin/payouts {action: "process_batch"}.
 *
 * Trigger: src/app/api/admin/payouts/route.ts inside the `process_batch`
 *          branch, AFTER the commission rows are flipped to status="paid".
 *          Aggregates commissions by partnerCode and sends ONE email per
 *          partner summarizing their total in the batch (not one email per
 *          individual commission row).
 *
 * Note: We never include sensitive payout method details (bank account
 * numbers, etc.) in the email body. The portal dashboard shows the full
 * payout history for partners who want to verify.
 */

import { renderEmail, escapeHtml, formatCurrency } from "./_layout";
import { FIRM_SHORT } from "@/lib/constants";

export interface PayoutProcessedEmailContext {
  /** Partner first name (greeting) */
  firstName: string;
  /** Total amount in this payout batch for this partner */
  totalAmount: number;
  /** Number of individual commission entries in this batch for this partner */
  commissionCount: number;
  /** Optional batch ID for portal deep link */
  batchId?: string | null;
  /** Optional period label (e.g. "March 2026") for clarity */
  periodLabel?: string | null;
}

export function payoutProcessedEmail(ctx: PayoutProcessedEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const formattedAmount = formatCurrency(ctx.totalAmount);
  const subject = `Your ${FIRM_SHORT} commission payout: ${formattedAmount}`;

  const heading = "Commission payout processed";
  const subheading = formattedAmount;

  const periodNote = ctx.periodLabel
    ? `<p style="margin:0 0 16px;">This payout covers commissions for <strong>${escapeHtml(ctx.periodLabel)}</strong>.</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(ctx.firstName)},</p>
    <p style="margin:0 0 16px;">
      Your commission payout has been processed. Here are the details:
    </p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0 24px;background:#fdf9ed;border:1px solid #f3ead0;border-radius:8px;">
      <tr>
        <td style="padding:20px 24px;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;color:#c4a050;">${escapeHtml(formattedAmount)}</div>
          <div style="margin-top:6px;font-size:12px;color:#6b7280;letter-spacing:0.5px;text-transform:uppercase;">
            ${ctx.commissionCount} commission${ctx.commissionCount === 1 ? "" : "s"} in this batch
          </div>
        </td>
      </tr>
    </table>
    ${periodNote}
    <p style="margin:0 0 16px;">
      Funds are being released according to your configured payout method.
      Depending on the method (ACH, wire, or check), arrival times vary —
      ACH typically lands within 1-3 business days.
    </p>
    <p style="margin:0 0 16px;">
      You can view the full breakdown of which deals contributed to this
      payout in your commission ledger.
    </p>
    <p style="margin:0;">
      Thanks for everything you do,<br>
      <strong>The ${escapeHtml(FIRM_SHORT)} Team</strong>
    </p>
  `;

  const html = renderEmail({
    heading,
    subheading,
    bodyHtml,
    cta: { label: "View Commission Ledger", url: "https://fintella.partners/dashboard/commissions" },
    previewText: `${formattedAmount} has been released across ${ctx.commissionCount} commission${ctx.commissionCount === 1 ? "" : "s"}.`,
  });

  const textLines = [
    `Your ${FIRM_SHORT} commission payout: ${formattedAmount}`,
    ``,
    `Hi ${ctx.firstName},`,
    ``,
    `Your commission payout has been processed.`,
    ``,
    `  Amount:      ${formattedAmount}`,
    `  Commissions: ${ctx.commissionCount}`,
  ];
  if (ctx.periodLabel) textLines.push(`  Period:      ${ctx.periodLabel}`);
  textLines.push(
    ``,
    `Funds are being released according to your configured payout method (ACH typically arrives in 1-3 business days).`,
    ``,
    `View the breakdown: https://fintella.partners/dashboard/commissions`,
    ``,
    `Thanks for everything you do,`,
    `The ${FIRM_SHORT} Team`
  );

  return { subject, html, text: textLines.join("\n") };
}
