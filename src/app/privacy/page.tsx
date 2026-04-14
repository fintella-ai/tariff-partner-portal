import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Privacy Policy — Fintella Partner Portal",
  description:
    "Privacy policy for the Fintella Partner Portal — how we collect, use, and protect partner information, including SMS notification consent.",
};

const LAST_UPDATED = "April 15, 2026";

/* ── Theme-aware CSS via prefers-color-scheme ─────────────────────────────
   Mirrors the existing /docs/webhook-guide page so all public pages share
   one visual identity. Light + dark variants via a single media query. */
const themeCSS = `
  :root {
    --doc-bg: #ffffff;
    --doc-text: #1a1a2e;
    --doc-text-secondary: #444;
    --doc-text-muted: #777;
    --doc-text-faint: #aaa;
    --doc-border: #e5e7eb;
    --doc-border-subtle: #f0f0f0;
    --doc-card-bg: #f8f9fa;
    --doc-info-bg: #fdf6e3;
    --doc-info-border: #c4a050;
    --doc-gold: #c4a050;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --doc-bg: #060a18;
      --doc-text: rgba(255,255,255,0.92);
      --doc-text-secondary: rgba(255,255,255,0.72);
      --doc-text-muted: rgba(255,255,255,0.45);
      --doc-text-faint: rgba(255,255,255,0.22);
      --doc-border: rgba(255,255,255,0.08);
      --doc-border-subtle: rgba(255,255,255,0.05);
      --doc-card-bg: rgba(255,255,255,0.03);
      --doc-info-bg: rgba(196,160,80,0.08);
      --doc-info-border: #c4a050;
      --doc-gold: #c4a050;
    }
  }
  body { margin: 0; }
  .legal-h2 {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 22px;
    font-weight: 700;
    color: var(--doc-text);
    margin: 36px 0 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .legal-h2::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--doc-gold);
    flex-shrink: 0;
  }
  .legal-p {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 15px;
    line-height: 1.7;
    color: var(--doc-text-secondary);
    margin: 0 0 14px;
  }
  .legal-ul {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 15px;
    line-height: 1.7;
    color: var(--doc-text-secondary);
    margin: 0 0 14px;
    padding-left: 22px;
  }
  .legal-ul li { margin-bottom: 6px; }
  .legal-strong { color: var(--doc-text); font-weight: 600; }
  @media (max-width: 640px) {
    .legal-h2 { font-size: 19px; margin-top: 28px; }
    .legal-p, .legal-ul { font-size: 14px; }
  }
`;

async function getLogoUrl(): Promise<string | null> {
  // Public page — DB read is best-effort. If Neon is briefly unreachable
  // or we're in a build environment without a connection, fall back to the
  // text wordmark so the page still renders for TCR reviewers.
  try {
    const settings = await prisma.portalSettings.findUnique({
      where: { id: "global" },
      select: { logoUrl: true },
    });
    return settings?.logoUrl || null;
  } catch {
    return null;
  }
}

export default async function PrivacyPage() {
  const logoUrl = await getLogoUrl();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
      <div
        style={{
          minHeight: "100vh",
          background: "var(--doc-bg)",
          color: "var(--doc-text)",
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.65,
        }}
      >
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto",
            padding: "clamp(20px, 5vw, 40px) clamp(16px, 4vw, 24px) 60px",
          }}
        >
          {/* ── Header ── */}
          <div style={{ marginBottom: 28 }}>
            <Link
              href="https://fintella.partners"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                color: "var(--doc-text-muted)",
                textDecoration: "none",
                marginBottom: 24,
                minHeight: 44,
                paddingTop: 12,
                paddingBottom: 12,
              }}
            >
              ← fintella.partners
            </Link>

            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Fintella"
                style={{ height: 40, width: "auto", marginBottom: 12, display: "block" }}
              />
            ) : (
              <div
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 26,
                  fontWeight: 700,
                  color: "var(--doc-gold)",
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                FINTELLA
              </div>
            )}
            <div style={{ fontSize: 13, color: "var(--doc-text-muted)", marginBottom: 24 }}>
              Financial Intelligence Network
            </div>

            <h1
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 32,
                fontWeight: 700,
                color: "var(--doc-text)",
                margin: "0 0 8px",
              }}
            >
              Privacy Policy
            </h1>
            <div style={{ height: 2, width: 80, background: "var(--doc-gold)", borderRadius: 2 }} />
            <div style={{ fontSize: 13, color: "var(--doc-text-muted)", marginTop: 12 }}>
              Last updated: {LAST_UPDATED}
            </div>
          </div>

          {/* ── Intro ── */}
          <p className="legal-p">
            Fintella (a DBA of Annexation PR LLC, &quot;<span className="legal-strong">Fintella</span>,&quot;
            &quot;<span className="legal-strong">we</span>,&quot; &quot;<span className="legal-strong">us</span>,&quot;
            or &quot;<span className="legal-strong">our</span>&quot;) operates the Fintella Partner Portal at{" "}
            <span className="legal-strong">fintella.partners</span> (the &quot;Service&quot;). This Privacy Policy
            explains what information we collect from referral partners, how we use it, who we share it with, and
            the choices and rights you have. By using the Service, you agree to the practices described in this
            policy.
          </p>

          {/* ── 1. Information We Collect ── */}
          <h2 className="legal-h2">1. Information We Collect</h2>
          <p className="legal-p">We collect the following categories of information from referral partners:</p>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Account information:</span> first and last name, email address, phone
              number (mobile and/or business), company or business name, mailing address, and Taxpayer Identification
              Number (TIN) for tax-reporting purposes.
            </li>
            <li>
              <span className="legal-strong">Payout information:</span> bank routing details or alternate payout
              method information that you provide so commissions can be paid.
            </li>
            <li>
              <span className="legal-strong">Account activity and usage data:</span> logins, deals submitted,
              referrals tracked, support tickets, and other activity inside the portal.
            </li>
            <li>
              <span className="legal-strong">Cookies and device data:</span> session cookies for authentication and
              analytics cookies that record general usage of the portal (see the Cookies section below).
            </li>
            <li>
              <span className="legal-strong">Communications you send us:</span> the content of support tickets,
              messages, emails, and any information you choose to provide when you contact us.
            </li>
          </ul>

          {/* ── 2. How We Use Your Information ── */}
          <h2 className="legal-h2">2. How We Use Your Information</h2>
          <p className="legal-p">We use the information we collect to:</p>
          <ul className="legal-ul">
            <li>Create and manage your partner account, including authentication and access control.</li>
            <li>
              Track referrals and calculate commissions owed to you based on your partner agreement.
            </li>
            <li>
              Send transactional notifications about your account activity, deal status updates, commission
              payments, and other operational messages by email and (if you opt in) by SMS.
            </li>
            <li>Process payouts and meet legal and tax-reporting obligations.</li>
            <li>Provide customer support and respond to your inquiries.</li>
            <li>
              Maintain the security and integrity of the Service, prevent fraud, and improve the platform.
            </li>
            <li>Comply with applicable laws and respond to lawful requests from authorities.</li>
          </ul>

          {/* ── 3. SMS / Text Messaging ── */}
          <h2 className="legal-h2">3. SMS / Text Messaging</h2>
          <p className="legal-p">
            <span className="legal-strong">
              By opting in to SMS notifications during account registration, you consent to receive transactional
              text messages about your account activity, deal status updates, and commission payment alerts.
            </span>
          </p>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Message frequency:</span> message frequency varies based on your account
              activity. You will only receive SMS messages tied to events that affect your partner account.
            </li>
            <li>
              <span className="legal-strong">Costs:</span> message and data rates may apply, depending on your mobile
              carrier and plan.
            </li>
            <li>
              <span className="legal-strong">Opt out:</span> you can stop messages at any time by replying{" "}
              <span className="legal-strong">STOP</span>. For help, reply{" "}
              <span className="legal-strong">HELP</span>.
            </li>
            <li>
              <span className="legal-strong">No third-party marketing sharing:</span> SMS opt-in consent is not
              shared with third parties for marketing purposes.
            </li>
            <li>
              <span className="legal-strong">SMS is optional:</span> SMS opt-in consent is not a condition of
              registration. You can use the Fintella Partner Portal without enrolling in SMS notifications, and you
              can change your SMS preference at any time in your account settings.
            </li>
          </ul>
          <p className="legal-p">
            SMS messages are sent through Twilio. Carriers are not liable for delayed or undelivered messages.
          </p>

          {/* ── 4. How We Share Your Information ── */}
          <h2 className="legal-h2">4. How We Share Your Information</h2>
          <p className="legal-p">
            <span className="legal-strong">We do not sell your personal information.</span> We share your
            information only with the trusted service providers that help us operate the Service:
          </p>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Twilio</span> — SMS and voice message delivery.
            </li>
            <li>
              <span className="legal-strong">SendGrid</span> — transactional email delivery.
            </li>
            <li>
              <span className="legal-strong">Vercel</span> — application hosting, analytics, and performance
              monitoring.
            </li>
            <li>
              <span className="legal-strong">Sentry</span> — error tracking and diagnostic logs.
            </li>
            <li>
              <span className="legal-strong">Neon</span> — managed PostgreSQL database hosting.
            </li>
            <li>
              <span className="legal-strong">Payment processors and banking providers</span> — to issue commission
              payouts.
            </li>
            <li>
              <span className="legal-strong">Tax and accounting providers</span> — for legally required reporting
              (for example, IRS Form 1099 issuance).
            </li>
          </ul>
          <p className="legal-p">
            Each service provider is contractually required to protect your information and use it only for the
            purpose of providing services to Fintella. We may also disclose information when required by law, in
            response to lawful requests by public authorities, or to protect our rights and the safety of our
            users.
          </p>

          {/* ── 5. Data Security ── */}
          <h2 className="legal-h2">5. Data Security</h2>
          <p className="legal-p">
            We protect your information using industry-standard safeguards, including encryption in transit
            (TLS/HTTPS) for all traffic to and from the portal, encryption at rest for the production database,
            role-based access controls so only authorized administrators can view sensitive fields, and ongoing
            security monitoring. No method of transmission or storage is 100% secure, but we work to apply
            reasonable and appropriate safeguards.
          </p>

          {/* ── 6. Your Rights ── */}
          <h2 className="legal-h2">6. Your Rights</h2>
          <p className="legal-p">You have the right to:</p>
          <ul className="legal-ul">
            <li>Access the personal information we hold about you.</li>
            <li>Correct inaccurate or incomplete information in your account.</li>
            <li>Request deletion of your account and associated personal information.</li>
            <li>
              Opt out of email marketing and SMS notifications at any time (transactional messages required for
              account servicing may continue while your account is active).
            </li>
            <li>
              Withdraw your consent to specific data uses, where consent is the legal basis for processing.
            </li>
          </ul>
          <p className="legal-p">
            To exercise any of these rights, contact us at{" "}
            <span className="legal-strong">support@fintellaconsulting.com</span>.
          </p>

          {/* ── 7. Cookies ── */}
          <h2 className="legal-h2">7. Cookies</h2>
          <p className="legal-p">We use a small number of cookies, all functional or analytics in nature:</p>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Session cookies</span> — used by our authentication system (NextAuth.js)
              to keep you signed in. These are required for the portal to function.
            </li>
            <li>
              <span className="legal-strong">Analytics cookies</span> — Vercel Analytics records anonymous,
              aggregated usage data (page views, performance metrics) so we can understand and improve how the
              portal is used.
            </li>
          </ul>
          <p className="legal-p">
            We do not use third-party advertising cookies or sell cookie data.
          </p>

          {/* ── 8. Data Retention ── */}
          <h2 className="legal-h2">8. Data Retention</h2>
          <p className="legal-p">
            We retain your account information for as long as your partner account is active and as needed to
            provide the Service. After your account is closed, we retain certain records (for example, commission
            history and tax records) for as long as required to meet our legal, accounting, and reporting
            obligations. You can request deletion of your data at any time by emailing{" "}
            <span className="legal-strong">support@fintellaconsulting.com</span>; we will delete your information
            except where we are legally required to retain it.
          </p>

          {/* ── 9. Children's Privacy ── */}
          <h2 className="legal-h2">9. Children&apos;s Privacy</h2>
          <p className="legal-p">
            The Fintella Partner Portal is not directed at children under the age of 13, and we do not knowingly
            collect personal information from children under 13. If we learn that we have collected personal
            information from a child under 13, we will delete that information. If you believe a child has
            provided us with personal information, please contact us.
          </p>

          {/* ── 10. Changes to This Policy ── */}
          <h2 className="legal-h2">10. Changes to This Policy</h2>
          <p className="legal-p">
            We may update this Privacy Policy from time to time. When we make material changes, we will notify
            partners by email and update the &quot;Last updated&quot; date at the top of this page. Continued use
            of the Service after a change indicates acceptance of the updated policy.
          </p>

          {/* ── 11. Contact Us ── */}
          <h2 className="legal-h2">11. Contact Us</h2>
          <p className="legal-p">
            If you have questions about this Privacy Policy or how we handle your information, contact us at:
          </p>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Email:</span> support@fintellaconsulting.com
            </li>
            <li>
              <span className="legal-strong">Mail:</span> Fintella, 19111 Collins Ave #1804, Sunny Isles Beach, FL 33160
            </li>
          </ul>

          {/* ── Footer ── */}
          <div
            style={{
              borderTop: "1px solid var(--doc-border)",
              paddingTop: 20,
              marginTop: 48,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 12,
              color: "var(--doc-text-faint)",
            }}
          >
            <span>Fintella Partner Portal — Privacy Policy</span>
            <span>Last updated {LAST_UPDATED}</span>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Link
              href="https://fintella.partners"
              style={{
                fontSize: 13,
                color: "var(--doc-text-muted)",
                textDecoration: "none",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              ← fintella.partners
            </Link>
            <Link
              href="/terms"
              style={{
                fontSize: 13,
                color: "var(--doc-gold)",
                textDecoration: "none",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Terms and Conditions →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
