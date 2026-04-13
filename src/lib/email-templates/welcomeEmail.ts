/**
 * Welcome email — sent when a new partner completes signup at /signup.
 *
 * Trigger: src/app/api/signup/route.ts after partner.create()
 *
 * Note: the partner's account starts in "pending" status until their L1
 * upline uploads a signed partnership agreement. The welcome email reflects
 * that — it confirms the account exists but tells the partner what to expect
 * next, rather than promising immediate access.
 */

import { renderEmail, escapeHtml } from "./_layout";
import { FIRM_SHORT } from "@/lib/constants";

export interface WelcomeEmailContext {
  /** Partner first name as captured at signup */
  firstName: string;
  /** Generated partner code (PTNXXXXXX) */
  partnerCode: string;
  /** L1 upline display name (or "your sponsor") */
  inviterName: string;
  /** Commission rate as a percentage integer (e.g. 15 for 15%) */
  commissionRatePercent: number;
  /** Tier label (e.g. "L2", "L3") for clarity */
  tierLabel: string;
}

export function welcomeEmail(ctx: WelcomeEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Welcome to ${FIRM_SHORT}, ${ctx.firstName} — your partner account is ready`;

  const heading = `Welcome to ${FIRM_SHORT}`;
  const subheading = `Partner Code: ${ctx.partnerCode}`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(ctx.firstName)},</p>
    <p style="margin:0 0 16px;">
      Your ${escapeHtml(FIRM_SHORT)} partner account has been created.
      You're set up as a <strong>${escapeHtml(ctx.tierLabel)} partner</strong> at
      <strong>${ctx.commissionRatePercent}% commission</strong>, sponsored by ${escapeHtml(ctx.inviterName)}.
    </p>
    <p style="margin:0 0 16px;">
      <strong>Next step:</strong> ${escapeHtml(ctx.inviterName)} will upload your signed
      partnership agreement shortly. Once that's approved by our team, your account
      will become active and you'll be able to log in to the portal, submit client
      referrals, and start earning commissions.
    </p>
    <p style="margin:0 0 16px;">
      In the meantime, here's what to expect:
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      <li style="margin-bottom:6px;">You'll receive a follow-up email when your agreement is on file.</li>
      <li style="margin-bottom:6px;">Your sponsor will receive notifications as you progress through onboarding.</li>
      <li style="margin-bottom:6px;">Once active, you'll have access to your personalized referral link, real-time deal tracking, training modules, and the weekly partner conference.</li>
    </ul>
    <p style="margin:0 0 16px;">
      If you have any questions in the meantime, reach out to your sponsor or reply to this email.
    </p>
    <p style="margin:0;">
      Welcome aboard,<br>
      <strong>The ${escapeHtml(FIRM_SHORT)} Team</strong>
    </p>
  `;

  const html = renderEmail({
    heading,
    subheading,
    bodyHtml,
    previewText: `Your ${FIRM_SHORT} partner account (${ctx.partnerCode}) is ready. Here's what happens next.`,
  });

  const text = [
    `Welcome to ${FIRM_SHORT}, ${ctx.firstName}.`,
    ``,
    `Your partner account has been created.`,
    `Partner Code: ${ctx.partnerCode}`,
    `Tier: ${ctx.tierLabel} at ${ctx.commissionRatePercent}% commission`,
    `Sponsored by: ${ctx.inviterName}`,
    ``,
    `Next step: Your sponsor will upload your signed partnership agreement shortly. Once approved, your account becomes active and you can log in to start submitting referrals.`,
    ``,
    `Questions? Reply to this email or reach out to your sponsor.`,
    ``,
    `Welcome aboard,`,
    `The ${FIRM_SHORT} Team`,
    `https://fintella.partners`,
  ].join("\n");

  return { subject, html, text };
}
