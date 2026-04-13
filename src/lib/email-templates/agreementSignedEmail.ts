/**
 * Agreement signed email — sent when SignWell webhook receives
 * `document_completed` for a partner's partnership agreement.
 *
 * Trigger: src/app/api/signwell/webhook/route.ts inside the
 *          `document_completed` branch, after the PartnershipAgreement
 *          row is updated to status="signed".
 */

import { renderEmail, escapeHtml } from "./_layout";
import { FIRM_SHORT } from "@/lib/constants";

export interface AgreementSignedEmailContext {
  firstName: string;
  partnerCode: string;
}

export function agreementSignedEmail(ctx: AgreementSignedEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Your ${FIRM_SHORT} partnership agreement is signed and active`;

  const heading = "Your agreement is signed";
  const subheading = "You're now an active partner";

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(ctx.firstName)},</p>
    <p style="margin:0 0 16px;">
      Great news — your ${escapeHtml(FIRM_SHORT)} partnership agreement has been
      signed and is now on file. Your account (${escapeHtml(ctx.partnerCode)})
      is officially active.
    </p>
    <p style="margin:0 0 16px;">
      You can now log in to the partner portal to:
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      <li style="margin-bottom:6px;">Submit client referrals through the dedicated submission form</li>
      <li style="margin-bottom:6px;">Generate your personalized referral link to share with prospects</li>
      <li style="margin-bottom:6px;">Track deals in real-time as they progress through the pipeline</li>
      <li style="margin-bottom:6px;">View your commission ledger and payout history</li>
      <li style="margin-bottom:6px;">Access training modules and join the weekly partner conference call</li>
    </ul>
    <p style="margin:0 0 16px;">
      If you have any questions about getting started, your account dashboard
      includes onboarding training that walks through everything step by step.
    </p>
    <p style="margin:0;">
      Welcome to the team,<br>
      <strong>The ${escapeHtml(FIRM_SHORT)} Team</strong>
    </p>
  `;

  const html = renderEmail({
    heading,
    subheading,
    bodyHtml,
    cta: { label: "Open Partner Portal", url: "https://fintella.partners/login" },
    previewText: `Your ${FIRM_SHORT} partnership agreement is on file. You can now log in and start submitting referrals.`,
  });

  const text = [
    `Your ${FIRM_SHORT} partnership agreement is signed and active.`,
    ``,
    `Hi ${ctx.firstName},`,
    ``,
    `Your partner account (${ctx.partnerCode}) is now active. You can log in to:`,
    `  - Submit client referrals`,
    `  - Generate your personalized referral link`,
    `  - Track deals in real-time`,
    `  - View commissions and payouts`,
    `  - Access training and the weekly partner call`,
    ``,
    `Log in: https://fintella.partners/login`,
    ``,
    `Welcome to the team,`,
    `The ${FIRM_SHORT} Team`,
  ].join("\n");

  return { subject, html, text };
}
