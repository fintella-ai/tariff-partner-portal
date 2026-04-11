import { Metadata } from "next";

export const metadata: Metadata = {
  title: "TRLN Webhook Integration Guide",
  description: "Referral webhook integration guide for Frost Law",
};

/* ── Theme-aware CSS via prefers-color-scheme ─────────────────────────── */
const themeCSS = `
  :root {
    --doc-bg: #ffffff;
    --doc-text: #1a1a2e;
    --doc-text-secondary: #555;
    --doc-text-muted: #888;
    --doc-text-faint: #aaa;
    --doc-border: #e5e7eb;
    --doc-border-subtle: #f0f0f0;
    --doc-card-bg: #f8f9fa;
    --doc-code-bg: #f0f0f5;
    --doc-code-text: #9a6e00;
    --doc-pre-bg: #1a1a2e;
    --doc-pre-text: #e0e0e0;
    --doc-pre-key: #c4a050;
    --doc-pre-val: #2d8a56;
    --doc-info-bg: #fdf6e3;
    --doc-info-border: #c4a050;
    --doc-gold: #c4a050;
    --doc-green: #16a34a;
    --doc-blue: #2563eb;
    --doc-purple: #7c3aed;
    --doc-orange: #ea580c;
    --doc-red: #dc2626;
    --doc-yellow: #ca8a04;
    --doc-badge-bg: #f0f0f5;
    --doc-badge-border: #d1d5db;
    --doc-badge-text: #374151;
    --doc-step-bg: rgba(196,160,80,0.1);
    --doc-step-border: rgba(196,160,80,0.25);
    --doc-cat-alpha: 0.06;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --doc-bg: #060a18;
      --doc-text: rgba(255,255,255,0.9);
      --doc-text-secondary: rgba(255,255,255,0.7);
      --doc-text-muted: rgba(255,255,255,0.4);
      --doc-text-faint: rgba(255,255,255,0.2);
      --doc-border: rgba(255,255,255,0.08);
      --doc-border-subtle: rgba(255,255,255,0.06);
      --doc-card-bg: rgba(255,255,255,0.03);
      --doc-code-bg: rgba(255,255,255,0.1);
      --doc-code-text: #f0d070;
      --doc-pre-bg: #0c1228;
      --doc-pre-text: rgba(255,255,255,0.7);
      --doc-pre-key: #c4a050;
      --doc-pre-val: #a8d8a8;
      --doc-info-bg: rgba(196,160,80,0.08);
      --doc-info-border: #c4a050;
      --doc-gold: #c4a050;
      --doc-green: #4ade80;
      --doc-blue: #60a5fa;
      --doc-purple: #a78bfa;
      --doc-orange: #fb923c;
      --doc-red: #f87171;
      --doc-yellow: #facc15;
      --doc-badge-bg: rgba(255,255,255,0.06);
      --doc-badge-border: rgba(255,255,255,0.1);
      --doc-badge-text: rgba(255,255,255,0.8);
      --doc-step-bg: rgba(196,160,80,0.15);
      --doc-step-border: rgba(196,160,80,0.25);
      --doc-cat-alpha: 0.04;
    }
  }
`;

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ background: "var(--doc-code-bg)", color: "var(--doc-code-text)", padding: "2px 6px", borderRadius: 4, fontSize: 13, fontFamily: "'SF Mono', Monaco, Consolas, monospace" }}>
      {children}
    </code>
  );
}

function FieldBadge({ children }: { children: string }) {
  return (
    <span style={{ display: "inline-block", background: "var(--doc-badge-bg)", border: "1px solid var(--doc-badge-border)", color: "var(--doc-badge-text)", padding: "3px 8px", borderRadius: 5, fontSize: 12, fontFamily: "'SF Mono', Monaco, Consolas, monospace", marginRight: 6, marginBottom: 6 }}>
      {children}
    </span>
  );
}

const FIELDS = [
  {
    category: "Partner Tracking",
    colorVar: "--doc-gold",
    fields: ["utm_content", "referral_code", "partner_code"],
    desc: "Identifies which TRLN partner referred the client. Passed through from the referral link URL parameter.",
  },
  {
    category: "Client Info",
    colorVar: "--doc-green",
    fields: ["first_name", "last_name", "email", "phone", "business_title"],
    desc: "Client contact details. At least one of name, email, or company is required.",
  },
  {
    category: "Business",
    colorVar: "--doc-blue",
    fields: ["legal_entity_name", "service_of_interest", "city", "state"],
    desc: "Business/company details and location.",
  },
  {
    category: "Tariff",
    colorVar: "--doc-purple",
    fields: ["imports_goods", "import_countries", "annual_import_value", "importer_of_record"],
    desc: "Tariff-specific qualification fields.",
  },
  {
    category: "Deal Stage",
    colorVar: "--doc-orange",
    fields: ["dealstage", "deal_stage", "stage", "pipeline_stage", "status"],
    desc: "Current stage in your pipeline. Stored exactly as sent (not mapped or transformed).",
  },
  {
    category: "Notes",
    colorVar: "--doc-text-muted",
    fields: ["affiliate_notes"],
    desc: "Any additional notes or comments from the form submission.",
  },
];

const STEPS = [
  <>TRLN partners share a referral link:<br /><span style={{ fontFamily: "monospace", fontSize: 12 }}>https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content=PTNABC123</span></>,
  "The client fills out the Frost Law referral form",
  <>The form system passes the <Code>utm_content</Code> value through to the webhook payload</>,
  "TRLN records the deal and attributes it to the correct partner",
  "The partner sees the deal in their portal dashboard",
];

export default function WebhookGuidePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
      <div style={{ minHeight: "100vh", background: "var(--doc-bg)", color: "var(--doc-text)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif", lineHeight: 1.65 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(20px, 5vw, 40px) clamp(12px, 4vw, 20px) 60px" }}>

          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--doc-gold)", letterSpacing: 2, marginBottom: 2 }}>TRLN</div>
            <div style={{ fontSize: 13, color: "var(--doc-text-muted)", marginBottom: 32 }}>Tariff Refund &amp; Litigation Network</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--doc-text)", margin: "0 0 8px" }}>Referral Webhook Integration Guide</h1>
            <div style={{ height: 2, width: 80, background: "var(--doc-gold)", borderRadius: 2 }} />
          </div>

          {/* Endpoint Details */}
          <Section title="Endpoint Details">
            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, overflow: "hidden" }}>
              {[
                ["Webhook URL", "https://trln.partners/api/webhook/referral"],
                ["Method", "POST"],
                ["Content-Type", "application/json"],
                ["Security Header", "x-webhook-secret: [provided separately]"],
              ].map(([label, value], i) => (
                <div key={label} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", padding: "14px 20px", borderTop: i > 0 ? "1px solid var(--doc-border-subtle)" : "none", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--doc-text-muted)", textTransform: "uppercase", letterSpacing: 1, width: 150, flexShrink: 0 }}>{label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--doc-text-secondary)", wordBreak: "break-all" }}>{value}</div>
                </div>
              ))}
            </div>
            <InfoBox>
              The security header is required on all requests. The secret token will be provided separately via secure channel. Requests without a valid token will receive a <Code>401 Unauthorized</Code> response.
            </InfoBox>
          </Section>

          {/* Accepted Fields */}
          <Section title="Accepted Fields">
            <p style={{ fontSize: 14, color: "var(--doc-text-muted)", marginBottom: 20 }}>
              All fields should be sent as a flat JSON object in the POST body. Field names are flexible — the endpoint accepts multiple naming conventions (snake_case, camelCase, or form labels).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {FIELDS.map((row) => (
                <div key={row.category} style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", borderLeftWidth: 3, borderLeftColor: `var(${row.colorVar})` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: `var(${row.colorVar})`, marginBottom: 10 }}>{row.category}</div>
                  <div style={{ marginBottom: 8 }}>
                    {row.fields.map((f) => <FieldBadge key={f}>{f}</FieldBadge>)}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--doc-text-muted)", lineHeight: 1.5 }}>{row.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Example Request */}
          <Section title="Example Request">
            <div style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--doc-border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--doc-green)", opacity: 0.6 }} />
                <span style={{ fontSize: 11, color: "var(--doc-text-muted)", fontFamily: "monospace" }}>POST /api/webhook/referral</span>
              </div>
              <pre style={{ padding: "16px 20px", fontSize: 13, lineHeight: 1.75, overflowX: "auto", color: "var(--doc-pre-text)", margin: 0 }}>
{`{`}
{jsonLine("utm_content", "PTNABC123")}
{jsonLine("first_name", "Jane")}
{jsonLine("last_name", "Smith")}
{jsonLine("email", "jane@acmeimports.com")}
{jsonLine("phone", "(555) 123-4567")}
{jsonLine("business_title", "CFO")}
{jsonLine("legal_entity_name", "Acme Imports LLC")}
{jsonLine("service_of_interest", "Tariff Refund Support")}
{jsonLine("city", "Phoenix")}
{jsonLine("state", "AZ")}
{jsonLine("imports_goods", "Yes")}
{jsonLine("import_countries", "China, Vietnam")}
{jsonLine("annual_import_value", "$1M - $5M")}
{jsonLine("importer_of_record", "Acme Imports LLC")}
{jsonLine("dealstage", "Qualified")}
{jsonLine("affiliate_notes", "Referred by CPA network", true)}
{`}`}
              </pre>
            </div>
          </Section>

          {/* Responses */}
          <Section title="Responses">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ResponseBlock color="var(--doc-green)" label="201 Created" body={`{\n  "received": true,\n  "dealId": "clx1234...",\n  "dealName": "Acme Imports LLC",\n  "partnerCode": "PTNABC123"\n}`} />
              <ResponseBlock color="var(--doc-yellow)" label="400 Validation Error" body={`{\n  "error": "At least one of: name, email, or company is required"\n}`} />
              <ResponseBlock color="var(--doc-red)" label="401 Unauthorized" body={`{\n  "error": "Unauthorized"\n}`} />
            </div>
          </Section>

          {/* Partner Tracking */}
          <Section title="How Partner Tracking Works">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {STEPS.map((text, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--doc-step-bg)", border: "1px solid var(--doc-step-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--doc-gold)" }}>{i + 1}</span>
                  </div>
                  <div style={{ fontSize: 14, color: "var(--doc-text-secondary)", paddingTop: 3 }}>{text}</div>
                </div>
              ))}
            </div>
            <InfoBox>
              If <Code>utm_content</Code> is not present in the payload, the deal is still created and stored as &quot;UNATTRIBUTED&quot; so no leads are lost.
            </InfoBox>
          </Section>

          {/* Health Check */}
          <Section title="Health Check">
            <p style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 12 }}>To verify the endpoint is live, send a <Code>GET</Code> request to the same URL:</p>
            <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "12px 20px", fontSize: 13, color: "var(--doc-pre-text)", overflowX: "auto", margin: 0 }}>
              GET https://trln.partners/api/webhook/referral
            </pre>
            <p style={{ fontSize: 13, color: "var(--doc-text-muted)", marginTop: 8 }}>Returns a JSON object with field documentation and endpoint status.</p>
          </Section>

          {/* Footer */}
          <div style={{ borderTop: "1px solid var(--doc-border)", paddingTop: 20, marginTop: 48, display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--doc-text-faint)" }}>
            <span>TRLN Partner Portal &mdash; Webhook Integration Guide</span>
            <span>April 2026</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Helper Components ───────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--doc-text)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--doc-gold)" }} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, background: "var(--doc-info-bg)", borderLeft: "4px solid var(--doc-info-border)", borderRadius: "0 8px 8px 0", padding: "14px 20px", fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function ResponseBlock({ color, label, body }: { color: string; label: string; body: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
      </div>
      <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", fontSize: 13, lineHeight: 1.7, color: "var(--doc-pre-text)", overflowX: "auto", margin: 0 }}>
        {body}
      </pre>
    </div>
  );
}

function jsonLine(key: string, value: string, last = false) {
  return (
    <>
      {`  `}<span style={{ color: "var(--doc-pre-key)" }}>&quot;{key}&quot;</span>{`: `}<span style={{ color: "var(--doc-pre-val)" }}>&quot;{value}&quot;</span>{last ? "" : ","}{"\n"}
    </>
  );
}
