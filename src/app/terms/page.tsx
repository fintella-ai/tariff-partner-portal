import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Terms and Conditions — Fintella Partner Portal",
  description:
    "Terms and conditions for the Fintella Partner Portal — partner obligations, commission structure, SMS communications, and governing terms.",
};

const LAST_UPDATED = "April 15, 2026";

/* ── Theme-aware CSS via prefers-color-scheme ─────────────────────────────
   Mirrors the existing /docs/webhook-guide and /privacy pages. */
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

export default async function TermsPage() {
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
              Terms and Conditions
            </h1>
            <div style={{ height: 2, width: 80, background: "var(--doc-gold)", borderRadius: 2 }} />
            <div style={{ fontSize: 13, color: "var(--doc-text-muted)", marginTop: 12 }}>
              Last updated: {LAST_UPDATED}
            </div>
          </div>

          {/* ── Intro ── */}
          <p className="legal-p">
            These Terms and Conditions (&quot;<span className="legal-strong">Terms</span>&quot;) govern your access
            to and use of the Fintella Partner Portal at{" "}
            <span className="legal-strong">fintella.partners</span> (the &quot;Service&quot;) operated by Fintella, a
            DBA of Annexation PR LLC (&quot;<span className="legal-strong">Fintella</span>,&quot; &quot;
            <span className="legal-strong">we</span>,&quot; &quot;<span className="legal-strong">us</span>,&quot;
            or &quot;<span className="legal-strong">our</span>&quot;). Please read these Terms carefully before
            using the Service.
          </p>

          {/* ── 1. Acceptance of Terms ── */}
          <h2 className="legal-h2">1. Acceptance of Terms</h2>
          <p className="legal-p">
            By creating a partner account, signing a partnership agreement, or otherwise accessing or using the
            Service, you agree to be bound by these Terms and by our{" "}
            <Link href="/privacy" style={{ color: "var(--doc-gold)" }}>
              Privacy Policy
            </Link>
            . If you do not agree to these Terms, do not use the Service.
          </p>

          {/* ── 2. Description of Service ── */}
          <h2 className="legal-h2">2. Description of Service</h2>
          <p className="legal-p">
            Fintella is a partner referral management platform that connects independent referral partners with
            professional service firms. The Service lets partners submit referrals, track deal progress, view
            commissions earned, manage their downline, and receive notifications about account activity.
          </p>

          {/* ── 3. Account Registration ── */}
          <h2 className="legal-h2">3. Account Registration</h2>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Invite-only:</span> partner accounts are created by invitation. You
              must hold a valid invite token from an existing partner or from Fintella to register.
            </li>
            <li>
              <span className="legal-strong">Accurate information:</span> you agree to provide truthful, accurate,
              and complete information at registration and to keep that information up to date.
            </li>
            <li>
              <span className="legal-strong">One account per person:</span> only one active partner account may
              be associated with any individual person or entity, except where Fintella has expressly approved
              otherwise in writing.
            </li>
            <li>
              <span className="legal-strong">Credential security:</span> you are responsible for keeping your
              login credentials confidential and for all activity that occurs under your account.
            </li>
          </ul>

          {/* ── 4. Partner Obligations ── */}
          <h2 className="legal-h2">4. Partner Obligations</h2>
          <p className="legal-p">As a Fintella partner, you agree to:</p>
          <ul className="legal-ul">
            <li>
              Submit only qualified referrals — clients with a genuine interest in the services offered, and
              accurate contact information.
            </li>
            <li>Maintain accurate account, contact, payout, and tax information at all times.</li>
            <li>
              Comply with all applicable laws and regulations, including marketing, telemarketing, anti-spam
              (CAN-SPAM, TCPA), data-protection, and tax laws in your jurisdiction.
            </li>
            <li>
              Not misrepresent Fintella, the firms it works with, or the services offered to clients in your
              outreach or marketing materials.
            </li>
            <li>
              Not use the Service to engage in fraudulent, deceptive, or unlawful activity, or to circumvent
              commission tracking.
            </li>
            <li>
              Use any partner referral links, reference materials, and marketing assets only as authorized by
              Fintella and any underlying partnership agreement.
            </li>
          </ul>

          {/* ── 5. Commission Structure ── */}
          <h2 className="legal-h2">5. Commission Structure</h2>
          <p className="legal-p">
            Commissions are calculated and paid in accordance with the partner agreement signed at registration
            (or as subsequently amended in writing). Key principles:
          </p>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Conditional payment:</span> a commission is only earned and payable
              after the underlying client has paid the partnered service firm in full <em>and</em> the firm has
              paid Fintella its corresponding override. No commission is payable on deals that do not reach this
              point.
            </li>
            <li>
              <span className="legal-strong">Waterfall structure:</span> commissions follow a tiered waterfall
              (L1, L2, and where applicable L3). Your assigned tier and rate are set in your partnership
              agreement and recruitment invite.
            </li>
            <li>
              <span className="legal-strong">Audit rights:</span> Fintella reserves the right to audit referral
              records, deal status, and commission calculations at any time, and to adjust, withhold, or claw
              back commissions found to be miscalculated, ineligible, or attributable to fraud or breach of these
              Terms.
            </li>
            <li>
              <span className="legal-strong">Tax reporting:</span> commissions are reported to U.S. tax
              authorities as required by law. You are responsible for any taxes owed on commissions paid to you.
            </li>
          </ul>

          {/* ── 6. SMS Communications ── */}
          <h2 className="legal-h2">6. SMS Communications</h2>
          <ul className="legal-ul">
            <li>
              <span className="legal-strong">Program name:</span> Fintella Partner Notifications.
            </li>
            <li>
              <span className="legal-strong">Program description:</span> transactional text messages about your
              account activity, deal status updates, and commission payment alerts.
            </li>
            <li>
              <span className="legal-strong">Message frequency:</span> message frequency varies based on your
              account activity.
            </li>
            <li>
              <span className="legal-strong">Costs:</span> message and data rates may apply.
            </li>
            <li>
              <span className="legal-strong">Carrier disclaimer:</span> wireless carriers are not liable for
              delayed or undelivered messages.
            </li>
            <li>
              <span className="legal-strong">Opt out:</span> text <span className="legal-strong">STOP</span> to
              cancel SMS notifications at any time.
            </li>
            <li>
              <span className="legal-strong">Help:</span> text <span className="legal-strong">HELP</span> for
              support, or contact us at{" "}
              <span className="legal-strong">support@fintellaconsulting.com</span>.
            </li>
            <li>
              <span className="legal-strong">Compatible carriers:</span> compatible carriers include AT&amp;T,
              T-Mobile, Verizon and others.
            </li>
            <li>
              <span className="legal-strong">Optional consent:</span> SMS opt-in consent is not a condition of
              registration, and your consent is not shared with third parties for marketing purposes.
            </li>
          </ul>
          <p className="legal-p">
            For more detail on how we handle SMS data, see our{" "}
            <Link href="/privacy" style={{ color: "var(--doc-gold)" }}>
              Privacy Policy
            </Link>
            .
          </p>

          {/* ── 7. Intellectual Property ── */}
          <h2 className="legal-h2">7. Intellectual Property</h2>
          <p className="legal-p">
            The Fintella name, logo, brand assets, the Fintella Partner Portal software, and all content made
            available through the Service (text, graphics, training materials, templates, documentation, and
            similar) are the proprietary property of Fintella and its licensors and are protected by copyright,
            trademark, and other intellectual-property laws. You are granted a limited, non-exclusive,
            non-transferable license to access and use the Service for the purpose of operating as a referral
            partner. You may not copy, modify, distribute, sell, or create derivative works from any part of the
            Service except as expressly authorized in writing by Fintella.
          </p>

          {/* ── 8. Limitation of Liability ── */}
          <h2 className="legal-h2">8. Limitation of Liability</h2>
          <p className="legal-p">
            To the maximum extent permitted by law, Fintella, its officers, directors, employees, and agents
            shall not be liable for any indirect, incidental, special, consequential, exemplary, or punitive
            damages, including loss of profits, data, goodwill, or other intangible losses, arising out of or in
            connection with your use of the Service. Fintella&apos;s aggregate liability arising out of or
            relating to these Terms and the Service shall not exceed the total amount of commissions paid by
            Fintella to you in the twelve (12) months immediately preceding the event giving rise to the claim,
            or one hundred U.S. dollars (US$100), whichever is greater. The Service is provided on an &quot;as
            is&quot; and &quot;as available&quot; basis without warranties of any kind, express or implied.
          </p>

          {/* ── 9. Termination ── */}
          <h2 className="legal-h2">9. Termination</h2>
          <p className="legal-p">
            Either party may terminate the partner relationship and your access to the Service at any time, with
            or without cause, by providing written notice (email is sufficient). Upon termination:
          </p>
          <ul className="legal-ul">
            <li>
              Your access to the Fintella Partner Portal will be revoked or restricted as appropriate.
            </li>
            <li>
              Commissions earned and payable under these Terms <em>before</em> the effective date of termination
              remain payable to you on the normal payout schedule, subject to Fintella&apos;s audit rights.
            </li>
            <li>
              Sections of these Terms that by their nature should survive termination (including intellectual
              property, limitation of liability, audit rights, and governing law) will continue in effect.
            </li>
          </ul>
          <p className="legal-p">
            Fintella may immediately suspend or terminate your account without notice if it reasonably believes
            you have violated these Terms, applicable law, or the integrity of the partner referral program.
          </p>

          {/* ── 10. Governing Law ── */}
          <h2 className="legal-h2">10. Governing Law</h2>
          <p className="legal-p">
            These Terms are governed by and construed in accordance with the laws of the State of Florida,
            without regard to its conflict-of-laws principles. The exclusive venue for any dispute arising out of
            or relating to these Terms or the Service shall be the state and federal courts located in Miami-Dade
            County, Florida, and you consent to the jurisdiction of those courts.
          </p>

          {/* ── 11. Changes to Terms ── */}
          <h2 className="legal-h2">11. Changes to Terms</h2>
          <p className="legal-p">
            We may modify these Terms from time to time. When we make material changes, we will notify partners
            by email at least thirty (30) days before the changes take effect, and will update the &quot;Last
            updated&quot; date at the top of this page. Your continued use of the Service after the effective
            date of an updated version constitutes acceptance of the changes. If you do not agree to the updated
            Terms, your sole remedy is to stop using the Service and terminate your account.
          </p>

          {/* ── 12. Contact ── */}
          <h2 className="legal-h2">12. Contact</h2>
          <p className="legal-p">Questions about these Terms can be sent to:</p>
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
            <span>Fintella Partner Portal — Terms and Conditions</span>
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
              href="/privacy"
              style={{
                fontSize: 13,
                color: "var(--doc-gold)",
                textDecoration: "none",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Privacy Policy →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
