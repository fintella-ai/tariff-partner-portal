"use client";

/**
 * Reference card for every event site in the codebase that fires an
 * email or SMS directly via the sendgrid.ts / twilio.ts helpers — not
 * through the workflow engine. These fire automatically; they can't be
 * disabled without a code change. The editable copy for each still
 * lives in the matching EmailTemplate / SmsTemplate row (falls back to
 * hardcoded body if the row is missing/disabled).
 *
 * Keep this list in sync with the helpers in src/lib/sendgrid.ts and
 * src/lib/twilio.ts whenever a new call site is added.
 */

interface Trigger {
  key: string;
  template: string;
  event: string;
  callSite: string;
  recipient: string;
}

const EMAIL_TRIGGERS: Trigger[] = [
  {
    key: "welcome",
    template: "welcome",
    event: "Partner signup completes",
    callSite: "src/app/api/signup/route.ts",
    recipient: "New partner",
  },
  {
    key: "signup_notification",
    template: "signup_notification",
    event: "Partner signup completes (inviter chain)",
    callSite: "src/app/api/signup/route.ts",
    recipient: "Upline partner who invited them",
  },
  {
    key: "agreement_ready",
    template: "agreement_ready",
    event: "Admin dispatches SignWell agreement",
    callSite: "src/app/api/admin/agreement/[partnerCode]/route.ts",
    recipient: "Partner being onboarded",
  },
  {
    key: "agreement_signed",
    template: "agreement_signed",
    event: "SignWell document_completed webhook",
    callSite: "src/app/api/signwell/webhook/route.ts",
    recipient: "Partner (welcome-aboard confirmation)",
  },
  {
    key: "l1_invite",
    template: "l1_invite",
    event: "Admin creates L1 invite (incl. resend + bulk-resend)",
    callSite: "src/app/api/admin/invites/route.ts",
    recipient: "Invited prospect",
  },
  {
    key: "partner_added_to_channel",
    template: "partner_added_to_channel",
    event: "Admin adds partner to an AnnouncementChannel",
    callSite: "src/app/api/admin/channels/[id]/members/route.ts",
    recipient: "Partner being added",
  },
  {
    key: "deal_status_update",
    template: "deal_status_update",
    event: "Referral webhook PATCH changes a deal stage",
    callSite: "src/app/api/webhook/referral/route.ts",
    recipient: "Submitting partner",
  },
  {
    key: "commission_payment_notification",
    template: "commission_payment_notification",
    event: "Commission ledger row flips to paid during payout batch",
    callSite: "src/app/api/admin/payouts/route.ts",
    recipient: "Paid partner",
  },
  {
    key: "password_reset",
    template: "password_reset",
    event: "Partner / admin submits forgot-password form",
    callSite: "src/app/api/auth/forgot-password/route.ts",
    recipient: "Account holder",
  },
  {
    key: "monthly_newsletter",
    template: "monthly_newsletter",
    event: "Vercel cron — 1st of each month",
    callSite: "src/app/api/cron/monthly-newsletter/route.ts",
    recipient: "Every active partner",
  },
];

export default function HardcodedTriggersDoc() {
  return (
    <div>
      <div className="card p-5 sm:p-6 mb-6 border-brand-gold/30 bg-brand-gold/[0.03]">
        <div className="font-body text-[13px] font-semibold text-[var(--app-text)] mb-2">Why these aren&apos;t in the Workflows tab</div>
        <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed">
          These emails fire from direct <code className="font-mono text-[11px] bg-[var(--app-input-bg)] px-1.5 py-0.5 rounded">sendXxxEmail()</code> calls at the event site (signup, SignWell webhook, referral webhook, payout batch, etc.). They&apos;re always-on and can&apos;t be toggled from the admin UI. The editable <strong>copy</strong> for each — subject, body, from, reply-to — still lives in the matching Email Templates row; the helper consults it at send time and falls back to hardcoded content only if the row is missing or disabled.
        </p>
        <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mt-3">
          To add new behavior (delay, conditional send, Slack ping, SMS companion) on top of one of these, create a workflow on the matching <strong>trigger</strong> in the Workflows tab — the trigger still fires for every event, so workflow actions can react to it even though the primary send is hardcoded.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_1.4fr_1fr_1fr] gap-4 px-4 py-3 border-b border-[var(--app-border)] bg-[var(--app-card-bg)]">
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Template</div>
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Event</div>
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Recipient</div>
          <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">Call site</div>
        </div>
        {EMAIL_TRIGGERS.map((t) => (
          <div
            key={t.key}
            className="md:grid md:grid-cols-[1fr_1.4fr_1fr_1fr] md:gap-4 px-4 py-4 border-b border-[var(--app-border)] last:border-b-0"
          >
            <div className="font-body text-[13px] font-semibold text-[var(--app-text)] mb-1 md:mb-0">
              <code className="font-mono text-[12px] text-brand-gold">{t.template}</code>
            </div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-1 md:mb-0 leading-snug">{t.event}</div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-1 md:mb-0">{t.recipient}</div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] font-mono break-all">{t.callSite}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
