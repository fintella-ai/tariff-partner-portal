import { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Fintella Webhook Integration Guide",
  description: "Referral webhook integration guide for Frost Law",
};

/**
 * Best-effort logo lookup. The /docs/webhook-guide page is public, so the DB
 * read can't be auth-gated. We accept the small extra latency in exchange
 * for keeping the brand asset in PortalSettings (single source of truth) and
 * fall back to no-logo if Neon hiccups so the page still renders cleanly.
 * Mirrors the same pattern in /privacy and /terms (PR #73).
 */
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
    desc: "Identifies which Fintella partner referred the client. Passed through from the referral link URL parameter.",
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
    category: "Consultation",
    colorVar: "--doc-yellow",
    fields: ["consult_booked_date", "consult_booked_time"],
    desc: "Consultation scheduling. Date (YYYY-MM-DD) and time (HH:MM). Can be updated via PATCH if rescheduled.",
  },
  {
    category: "Notes",
    colorVar: "--doc-text-muted",
    fields: ["affiliate_notes"],
    desc: "Any additional notes or comments from the form submission.",
  },
  {
    category: "Idempotency",
    colorVar: "--doc-blue",
    fields: ["idempotencyKey", "idempotency_key"],
    desc: "Optional. Any unique string (e.g. your internal form submission ID). If you POST the same key twice, the second call returns 200 with the original dealId and no duplicate is created. Strongly recommended on every POST to make retries safe.",
  },
  {
    category: "Event Type",
    colorVar: "--doc-text-muted",
    fields: ["event"],
    desc: "Optional. If present, must be one of: referral.submitted, referral.stage_updated, referral.closed. Leave unset to match existing payloads.",
  },
];

const STEPS = [
  <>Fintella partners share a referral link:<br /><span style={{ fontFamily: "monospace", fontSize: 12 }}>https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content=PTNABC123</span></>,
  "When a client is qualified by our referral partner, our partner fills out the Frost Law referral form with the client's required information",
  <>The form system passes the <Code>utm_content</Code> value through to the webhook payload<br /><span style={{ display: "block", marginTop: 6, paddingLeft: 16, fontSize: 13, color: "var(--doc-text-muted)" }}>&#8226; <strong style={{ color: "var(--doc-gold)" }}>NOTE:</strong> HubSpot CRM will automatically pull the &quot;utm_content&quot; parameters into the contact when created in HubSpot with no further integration needed. This is our partner referral code.</span></>,
  "Fintella records the deal and attributes it to the correct partner",
  "The partner sees the deal in their portal dashboard",
];

export default async function WebhookGuidePage() {
  const logoUrl = await getLogoUrl();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
      <div style={{ minHeight: "100vh", background: "var(--doc-bg)", color: "var(--doc-text)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif", lineHeight: 1.65 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(20px, 5vw, 40px) clamp(12px, 4vw, 20px) 60px" }}>

          {/* Header — logo (if PortalSettings has one) sits left of the
              FINTELLA wordmark + subtitle stack. Logo is a square sized via
              `aspectRatio: 1/1` + `alignSelf: stretch` so it auto-spans from
              the top of FINTELLA to the bottom of "Financial Intelligence
              Network" without us hardcoding pixel heights. Falls back to
              text-only when no logo is configured. */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 14, marginBottom: 24 }}>
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Fintella"
                  style={{
                    aspectRatio: "1 / 1",
                    alignSelf: "stretch",
                    height: "auto",
                    width: "auto",
                    maxHeight: "100%",
                    borderRadius: 4,
                    objectFit: "contain",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--doc-gold)", letterSpacing: 2, marginBottom: 2 }}>FINTELLA</div>
                <div style={{ fontSize: 13, color: "var(--doc-text-muted)" }}>Financial Intelligence Network</div>
              </div>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--doc-text)", margin: "0 0 8px" }}>Referral Webhook Integration Guide</h1>
            <div style={{ height: 2, width: 80, background: "var(--doc-gold)", borderRadius: 2 }} />
          </div>

          {/* Navigation Menu */}
          <nav style={{ marginBottom: 40, background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--doc-text-muted)", marginBottom: 12 }}>Quick Navigation</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                { href: "#overview", label: "Overview" },
                { href: "#security", label: "Security" },
                { href: "#deal-creation", label: "Deal Creation (POST)" },
                { href: "#store-deal-id", label: "Store Deal ID" },
                { href: "#update-deal", label: "Updating a Deal (PATCH)" },
                { href: "#closing-deal", label: "Closing a Deal" },
                { href: "#curl-examples", label: "cURL Examples" },
                { href: "#error-handling", label: "Error Handling" },
                { href: "#health-check", label: "Health Check" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{ fontSize: 13, color: "var(--doc-gold)", background: "var(--doc-step-bg)", border: "1px solid var(--doc-step-border)", borderRadius: 8, padding: "8px 16px", textDecoration: "none", fontWeight: 500, transition: "opacity 0.2s" }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </nav>

          {/* ═══ OVERVIEW — HOW PARTNER TRACKING WORKS ═══ */}
          <div id="overview" style={{ scrollMarginTop: 20 }}>
          <Section title="Overview — How Partner Tracking Works">
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

            {/* Endpoint summary */}
            <div style={{ marginTop: 20, background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, overflow: "hidden" }}>
              {[
                ["Webhook URL", "https://fintella.partners/api/webhook/referral"],
                ["Methods", "POST (create) · PATCH (update) · GET (health)"],
                ["Content-Type", "application/json"],
                ["Authentication", "X-Fintella-Api-Key: [provided separately]"],
                ["Rate Limit", "60 requests / 60 seconds per API key"],
                ["Idempotency", "optional idempotencyKey field on POST body"],
              ].map(([label, value], i) => (
                <div key={label} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", padding: "14px 20px", borderTop: i > 0 ? "1px solid var(--doc-border-subtle)" : "none", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--doc-text-muted)", textTransform: "uppercase", letterSpacing: 1, width: 150, flexShrink: 0 }}>{label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--doc-text-secondary)", wordBreak: "break-all" }}>{value}</div>
                </div>
              ))}
            </div>
            <InfoBox>
              The API key will be provided via a secure channel (never in docs, never in email). The full security contract — auth schemes, rate limits, HMAC, idempotency — is documented in the next section.
            </InfoBox>
          </Section>
          </div>

          {/* ═══ SECURITY & RELIABILITY ═══ */}
          <div id="security" style={{ scrollMarginTop: 20 }}>
          <Section title="Security & Reliability">
            <p style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 16 }}>
              The webhook applies four independent protections in front of every request: API-key auth, per-key rate limiting, optional HMAC signature verification, and idempotency enforcement. Here is the full contract so you can implement it correctly on first attempt.
            </p>

            {/* Auth block */}
            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", borderLeftWidth: 3, borderLeftColor: "var(--doc-gold)", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--doc-gold)", marginBottom: 10 }}>1. API Key Authentication</div>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 10 }}>
                Send the shared API key on every request as an HTTP header. Two header names are accepted — use whichever is easier for your side:
              </p>
              <ul style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.7, marginTop: 0, marginBottom: 10, paddingLeft: 20 }}>
                <li>Preferred: <Code>X-Fintella-Api-Key: &lt;key&gt;</Code></li>
                <li>Legacy (still accepted): <Code>x-webhook-secret: &lt;key&gt;</Code> or <Code>Authorization: Bearer &lt;key&gt;</Code></li>
              </ul>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 0 }}>
                A request with no valid key returns <Code>401 Unauthorized</Code>. Never log, screenshot, or paste the key in tickets or chat.
              </p>
            </div>

            {/* Rate limit block */}
            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", borderLeftWidth: 3, borderLeftColor: "var(--doc-orange)", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--doc-orange)", marginBottom: 10 }}>2. Rate Limit</div>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 10 }}>
                <strong style={{ color: "var(--doc-text)" }}>60 requests per 60 seconds per API key</strong>, sliding window. If you exceed this you receive:
              </p>
              <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, lineHeight: 1.5, color: "var(--doc-pre-text)", overflowX: "auto", margin: "0 0 10px" }}>
{`HTTP/1.1 429 Too Many Requests
Retry-After: 17

{ "error": "Too many requests", "retryAfter": 17 }`}
              </pre>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 0 }}>
                Respect the <Code>Retry-After</Code> header (value is in seconds). For bulk backfills please coordinate with us directly rather than hammering the endpoint.
              </p>
            </div>

            {/* Idempotency block */}
            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", borderLeftWidth: 3, borderLeftColor: "var(--doc-blue)", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--doc-blue)", marginBottom: 10 }}>3. Idempotency</div>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 10 }}>
                Add an optional top-level <Code>idempotencyKey</Code> field to every POST body. Any unique string works — your internal form submission UUID, a hash of the payload, or a random token you generate once per submission:
              </p>
              <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, lineHeight: 1.5, color: "var(--doc-pre-text)", overflowX: "auto", margin: "0 0 10px" }}>
{`{
  "idempotencyKey": "fl-ref-20260414-abc123",
  "utm_content": "PTNABC123",
  "first_name": "Jane",
  ...
}`}
              </pre>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 0 }}>
                The <em>first</em> POST with a new key returns <Code>201 Created</Code> with the new <Code>dealId</Code>. Any <em>subsequent</em> POST with the <strong style={{ color: "var(--doc-text)" }}>same</strong> key returns <Code>200 OK</Code> with <Code>idempotent: true</Code> pointing at the original deal — no duplicate is created. This makes retries on network error completely safe. <strong style={{ color: "var(--doc-gold)" }}>We strongly recommend sending it on every POST.</strong>
              </p>
            </div>

            {/* HMAC block */}
            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", borderLeftWidth: 3, borderLeftColor: "var(--doc-purple)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--doc-purple)", marginBottom: 10 }}>4. HMAC Signature (optional, not yet enforced)</div>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 10 }}>
                For defense in depth against API-key leaks, you can optionally include an HMAC-SHA256 signature of the request body. Compute it with a shared secret we provide (separate from the API key) and send it in the header:
              </p>
              <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, lineHeight: 1.5, color: "var(--doc-pre-text)", overflowX: "auto", margin: "0 0 10px" }}>
{`X-Fintella-Signature: sha256=<hex digest of HMAC-SHA256(rawBody, secret)>`}
              </pre>
              <p style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.6, marginTop: 0, marginBottom: 0 }}>
                Currently this is <strong style={{ color: "var(--doc-yellow)" }}>accepted and verified but not enforced</strong> — mismatches are logged in our error tracker only. We will flip to hard enforcement once your side is ready. Coordinate before sending live signed traffic.
              </p>
            </div>
          </Section>
          </div>

          {/* ═══ DEAL CREATION (POST) ═══ */}
          <div id="deal-creation" style={{ scrollMarginTop: 20 }}>
          <Section title="Deal Creation (POST)">
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
{`{\n`}{jsonLine("utm_content", "PTNABC123")}
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
{jsonLine("consult_booked_date", "2026-04-15")}
{jsonLine("consult_booked_time", "14:00")}
{jsonLine("dealstage", "Qualified")}
{jsonLine("affiliate_notes", "Referred by CPA network", true)}
{`}`}
              </pre>
            </div>
          </Section>

          {/* POST Responses */}
          <Section title="POST Responses">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ResponseBlock color="var(--doc-green)" label="201 Created (new deal)" body={`{\n  "received": true,\n  "dealId": "clx1234...",\n  "dealName": "Acme Imports LLC",\n  "partnerCode": "PTNABC123"\n}`} />
              <ResponseBlock color="var(--doc-blue)" label="200 OK (idempotent replay — same idempotencyKey as a prior POST)" body={`{\n  "received": true,\n  "dealId": "clx1234...",\n  "dealName": "Acme Imports LLC",\n  "partnerCode": "PTNABC123",\n  "idempotent": true\n}`} />
              <ResponseBlock color="var(--doc-yellow)" label="400 Validation Error" body={`{\n  "error": "At least one of: name, email, or company is required"\n}`} />
              <ResponseBlock color="var(--doc-red)" label="401 Unauthorized (missing or wrong API key)" body={`{\n  "error": "Unauthorized"\n}`} />
              <ResponseBlock color="var(--doc-orange)" label="429 Too Many Requests (rate limit)" body={`{\n  "error": "Too many requests",\n  "retryAfter": 17\n}`} />
            </div>
          </Section>

          </div>

          {/* ═══ STORE DEAL ID ═══ */}
          <div id="store-deal-id" style={{ scrollMarginTop: 20 }}>
          <Section title="Important: Store the Deal ID">
            <InfoBox>
              When you create a deal via <Code>POST</Code>, the response includes a <Code>dealId</Code>. <strong style={{ color: "var(--doc-gold)" }}>You must store this ID</strong> in your HubSpot deal record. It is required to send future updates (stage changes, amounts, etc.) to our system.
            </InfoBox>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 8 }}>1. Create the deal:</div>
              <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", fontSize: 13, lineHeight: 1.7, color: "var(--doc-pre-text)", overflowX: "auto", margin: 0 }}>
{`POST https://fintella.partners/api/webhook/referral
→ 201 Created

{
  "received": true,
  "dealId": "clx8f9abc123def456",
  "dealName": "Acme Imports LLC",
  "partnerCode": "PTNABC123"
}`}
              </pre>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 8 }}>2. Store <Code>dealId</Code> in your HubSpot deal as a custom property (e.g. <Code>fintella_deal_id</Code>)</div>
              <div style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 8 }}>3. Use this ID for all future updates to the deal:</div>
            </div>
          </Section>

          </div>

          {/* ═══ UPDATING A DEAL (PATCH) ═══ */}
          <div id="update-deal" style={{ scrollMarginTop: 20 }}>
          <Section title="Updating a Deal (PATCH)">
            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              {[
                ["Endpoint", "PATCH /api/webhook/referral"],
                ["Method", "PATCH"],
                ["Required Field", "dealId (from the original POST response)"],
                ["Security Header", "x-webhook-secret: [same as POST]"],
              ].map(([label, value], i) => (
                <div key={label} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", padding: "14px 20px", borderTop: i > 0 ? "1px solid var(--doc-border-subtle)" : "none", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--doc-text-muted)", textTransform: "uppercase", letterSpacing: 1, width: 150, flexShrink: 0 }}>{label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--doc-text-secondary)", wordBreak: "break-all" }}>{value}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 14, color: "var(--doc-text-muted)", marginBottom: 20 }}>
              Send any combination of these fields to update the deal. Only include the fields that changed — all are optional except <Code>dealId</Code>.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {[
                {
                  category: "Required",
                  colorVar: "--doc-red",
                  fields: ["dealId"],
                  desc: "The unique deal ID returned in the original POST 201 response. Must be stored in your system.",
                },
                {
                  category: "Conditionally Required",
                  colorVar: "--doc-red",
                  fields: ["estimated_refund_amount", "firm_fee_rate"],
                  desc: "client_engaged (contract signed): only firm_fee_rate is required. in_process and closedwon: BOTH estimated_refund_amount and firm_fee_rate must be present — either in the PATCH body or already on the deal from a prior update. firm_fee_amount is NOT required; it is derived from refund × rate.",
                },
                {
                  category: "Deal Stage",
                  colorVar: "--doc-orange",
                  fields: ["dealstage", "deal_stage", "stage"],
                  desc: "Current stage in your pipeline. Stored as-is. If set to 'Closed Won' or 'Closed Lost', the close date is automatically recorded.",
                },
                {
                  category: "Financials",
                  colorVar: "--doc-green",
                  fields: [
                    "estimated_refund_amount",
                    "actual_refund_amount",
                    "firm_fee_rate",
                    "firm_fee_amount",
                  ],
                  desc: "Estimated refund at submission, actual refund once the client has received the check from IRS/CBP, firm fee rate (e.g. 20 or 0.20), and firm fee dollar amount.",
                },
                {
                  category: "Client Info",
                  colorVar: "--doc-blue",
                  fields: [
                    "first_name",
                    "last_name",
                    "email",
                    "phone",
                    "business_title",
                  ],
                  desc: "Correct or enrich the client contact details. Composite client name is auto-rebuilt from first + last.",
                },
                {
                  category: "Business Details",
                  colorVar: "--doc-blue",
                  fields: [
                    "legal_entity_name",
                    "service_of_interest",
                    "city",
                    "state",
                  ],
                  desc: "Update the business entity name, service of interest, or location.",
                },
                {
                  category: "Tariff Fields",
                  colorVar: "--doc-blue",
                  fields: [
                    "imports_goods",
                    "import_countries",
                    "annual_import_value",
                    "importer_of_record",
                  ],
                  desc: "Update tariff-specific intake fields as you learn more during qualification.",
                },
                {
                  category: "Product Details",
                  colorVar: "--doc-blue",
                  fields: ["product_type", "imported_products"],
                  desc: "Set the product category (ieepa, section301, other) and a free-text description of the goods.",
                },
                {
                  category: "Consultation",
                  colorVar: "--doc-yellow",
                  fields: ["consult_booked_date", "consult_booked_time"],
                  desc: "Reschedule or set the consultation date/time. Overwrites previous values.",
                },
                {
                  category: "Notes",
                  colorVar: "--doc-text-muted",
                  fields: ["affiliate_notes", "notes"],
                  desc: "Free-text affiliate notes from the referral source, or internal notes on the deal.",
                },
                {
                  category: "Closed Lost",
                  colorVar: "--doc-text-muted",
                  fields: ["closed_lost_reason"],
                  desc: "Optional reason if the deal is moved to Closed Lost. Not required.",
                },
                {
                  category: "Locked (server-managed)",
                  colorVar: "--doc-red",
                  fields: [
                    "id",
                    "partnerCode",
                    "idempotencyKey",
                    "paymentReceivedAt",
                    "paymentReceivedBy",
                    "closeDate",
                    "createdAt",
                    "updatedAt",
                  ],
                  desc: "These fields are NOT updatable via PATCH. Payment-received and close date are stamped automatically; the partner code and deal ID are immutable after creation.",
                },
              ].map((row) => (
                <div key={row.category} style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", borderLeftWidth: 3, borderLeftColor: `var(${row.colorVar})` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: `var(${row.colorVar})`, marginBottom: 10 }}>{row.category}</div>
                  <div style={{ marginBottom: 8 }}>
                    {row.fields.map((f) => <FieldBadge key={f}>{f}</FieldBadge>)}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--doc-text-muted)", lineHeight: 1.5 }}>{row.desc}</div>
                </div>
              ))}
            </div>

            {/* Example PATCH request */}
            <div style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--doc-border-subtle)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--doc-orange)", opacity: 0.6 }} />
                <span style={{ fontSize: 11, color: "var(--doc-text-muted)", fontFamily: "monospace" }}>PATCH /api/webhook/referral</span>
              </div>
              <pre style={{ padding: "16px 20px", fontSize: 13, lineHeight: 1.7, overflowX: "auto", color: "var(--doc-pre-text)", margin: 0 }}>
{`{
  `}<span style={{ color: "var(--doc-pre-key)" }}>&quot;dealId&quot;</span>{`:                 `}<span style={{ color: "var(--doc-pre-val)" }}>&quot;clx8f9abc123def456&quot;</span>{`,
  `}<span style={{ color: "var(--doc-pre-key)" }}>&quot;dealstage&quot;</span>{`:               `}<span style={{ color: "var(--doc-pre-val)" }}>&quot;Contract Sent&quot;</span>{`,
  `}<span style={{ color: "var(--doc-pre-key)" }}>&quot;estimated_refund_amount&quot;</span>{`: `}<span style={{ color: "var(--doc-pre-val)" }}>250000</span>{`,
  `}<span style={{ color: "var(--doc-pre-key)" }}>&quot;firm_fee_rate&quot;</span>{`:           `}<span style={{ color: "var(--doc-pre-val)" }}>20</span>{`,
  `}<span style={{ color: "var(--doc-pre-key)" }}>&quot;firm_fee_amount&quot;</span>{`:         `}<span style={{ color: "var(--doc-pre-val)" }}>50000</span>{`
}`}
              </pre>
            </div>

            {/* PATCH Responses */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ResponseBlock color="var(--doc-green)" label="200 Updated" body={`{\n  "updated": true,\n  "dealId": "clx8f9abc123def456",\n  "dealName": "Acme Imports LLC",\n  "fieldsUpdated": ["externalStage", "estimatedRefundAmount", "firmFeeRate", "firmFeeAmount"]\n}`} />
              <ResponseBlock color="var(--doc-yellow)" label="400 Missing dealId" body={`{\n  "error": "dealId is required"\n}`} />
              <ResponseBlock color="var(--doc-red)" label="404 Deal Not Found" body={`{\n  "error": "Deal not found"\n}`} />
            </div>
          </Section>

          {/* ── CLOSED LOST EXAMPLE ── */}
          <div id="closing-deal" style={{ scrollMarginTop: 20 }}>
          <Section title="Closing a Deal">
            <p style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 16 }}>When a deal reaches its final stage, send a PATCH with the stage. The close date is recorded automatically.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--doc-green)", marginBottom: 8 }}>Closed Won:</div>
                <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", fontSize: 13, lineHeight: 1.7, color: "var(--doc-pre-text)", overflowX: "auto", margin: 0 }}>
{`{
  "dealId": "clx8f9abc123def456",
  "dealstage": "Closed Won",
  "estimated_refund_amount": 300000,
  "actual_refund_amount": 287500,
  "firm_fee_rate": 20,
  "firm_fee_amount": 57500
}`}
                </pre>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--doc-red)", marginBottom: 8 }}>Closed Lost (with optional reason):</div>
                <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "16px 20px", fontSize: 13, lineHeight: 1.7, color: "var(--doc-pre-text)", overflowX: "auto", margin: 0 }}>
{`{
  "dealId": "clx8f9abc123def456",
  "dealstage": "Closed Lost",
  "closed_lost_reason": "Client decided not to pursue recovery"
}`}
                </pre>
              </div>
            </div>
          </Section>

          </div>
          </div>

          {/* ═══ CURL EXAMPLES ═══ */}
          <div id="curl-examples" style={{ scrollMarginTop: 20 }}>
          <Section title="cURL Examples">
            <p style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 16 }}>
              Three end-to-end examples. Replace <Code>$FINTELLA_KEY</Code> with the API key we provided.
            </p>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--doc-green)", marginBottom: 8 }}>1. New referral (POST)</div>
            <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "14px 20px", fontSize: 12, lineHeight: 1.6, color: "var(--doc-pre-text)", overflowX: "auto", margin: "0 0 20px" }}>
{`curl -X POST https://fintella.partners/api/webhook/referral \\
  -H "Content-Type: application/json" \\
  -H "X-Fintella-Api-Key: $FINTELLA_KEY" \\
  -d '{
    "idempotencyKey": "fl-ref-20260414-abc123",
    "utm_content": "PTNABC123",
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@acmeimports.com",
    "phone": "(555) 123-4567",
    "legal_entity_name": "Acme Imports LLC",
    "service_of_interest": "Tariff Refund Support",
    "city": "Phoenix",
    "state": "AZ",
    "imports_goods": "Yes",
    "import_countries": "China, Vietnam",
    "annual_import_value": "$1M - $5M"
  }'

# → 201 Created
# { "received": true, "dealId": "clx8f9abc123", "dealName": "Acme Imports LLC", "partnerCode": "PTNABC123" }`}
            </pre>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--doc-orange)", marginBottom: 8 }}>2. Stage update (PATCH)</div>
            <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "14px 20px", fontSize: 12, lineHeight: 1.6, color: "var(--doc-pre-text)", overflowX: "auto", margin: "0 0 20px" }}>
{`curl -X PATCH https://fintella.partners/api/webhook/referral \\
  -H "Content-Type: application/json" \\
  -H "X-Fintella-Api-Key: $FINTELLA_KEY" \\
  -d '{
    "dealId": "clx8f9abc123",
    "dealstage": "Contract Sent",
    "estimated_refund_amount": 250000,
    "firm_fee_rate": 20
  }'

# → 200 OK
# { "updated": true, "dealId": "clx8f9abc123", "dealName": "Acme Imports LLC",
#   "fieldsUpdated": ["externalStage", "estimatedRefundAmount", "firmFeeRate"] }`}
            </pre>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--doc-green)", marginBottom: 8 }}>3. Closed won (PATCH)</div>
            <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "14px 20px", fontSize: 12, lineHeight: 1.6, color: "var(--doc-pre-text)", overflowX: "auto", margin: "0 0 0" }}>
{`curl -X PATCH https://fintella.partners/api/webhook/referral \\
  -H "Content-Type: application/json" \\
  -H "X-Fintella-Api-Key: $FINTELLA_KEY" \\
  -d '{
    "dealId": "clx8f9abc123",
    "dealstage": "Closed Won",
    "estimated_refund_amount": 300000,
    "actual_refund_amount": 287500,
    "firm_fee_rate": 20,
    "firm_fee_amount": 57500
  }'

# → 200 OK
# closeDate is automatically stamped when stage normalizes to "closedwon" or "closedlost"
# actual_refund_amount captures what the client really received vs the estimate`}
            </pre>
            <InfoBox>
              A testing sandbox is available on request — ask us and we will issue a preview-only API key that points at an isolated deal table.
            </InfoBox>
          </Section>
          </div>

          {/* ═══ ERROR HANDLING & RETRY ═══ */}
          <div id="error-handling" style={{ scrollMarginTop: 20 }}>
          <Section title="Error Handling & Retry Strategy">
            <p style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 16 }}>
              The webhook returns standard HTTP status codes. Handle them as follows:
            </p>

            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
              {[
                ["201", "Created", "New deal successfully created. Store the returned dealId.", "var(--doc-green)"],
                ["200", "OK", "Either an idempotent replay of a prior POST, or a successful PATCH update.", "var(--doc-blue)"],
                ["400", "Bad Request", "Invalid JSON, missing required fields, or invalid event type. Do NOT retry — fix the payload.", "var(--doc-yellow)"],
                ["401", "Unauthorized", "Missing or wrong API key. Do NOT retry — check your X-Fintella-Api-Key header.", "var(--doc-red)"],
                ["404", "Not Found", "PATCH with an unknown dealId. Do NOT retry — verify the dealId you're updating.", "var(--doc-red)"],
                ["429", "Too Many Requests", "Rate limit exceeded. Respect the Retry-After header and retry after the indicated number of seconds.", "var(--doc-orange)"],
                ["5xx", "Server Error", "Our side is having a problem. Retry with exponential backoff (see schedule below). Max 5 attempts.", "var(--doc-purple)"],
              ].map(([code, name, desc, color], i) => (
                <div key={code} style={{ padding: "14px 20px", borderTop: i > 0 ? "1px solid var(--doc-border-subtle)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color }}>{code}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--doc-text)" }}>{name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--doc-text-secondary)", lineHeight: 1.5, paddingLeft: 18 }}>{desc}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--doc-text)", marginBottom: 8 }}>Recommended retry schedule for 5xx and 429:</div>
            <div style={{ background: "var(--doc-card-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
              {[
                ["Attempt 1", "immediately"],
                ["Attempt 2", "after 30 seconds"],
                ["Attempt 3", "after 2 minutes"],
                ["Attempt 4", "after 10 minutes"],
                ["Attempt 5", "after 1 hour"],
                ["Give up", "log + alert your ops channel"],
              ].map(([step, delay], i) => (
                <div key={step} style={{ display: "flex", padding: "10px 20px", borderTop: i > 0 ? "1px solid var(--doc-border-subtle)" : "none", fontSize: 13 }}>
                  <div style={{ width: 120, color: "var(--doc-text-muted)", flexShrink: 0 }}>{step}</div>
                  <div style={{ fontFamily: "monospace", color: "var(--doc-text-secondary)" }}>{delay}</div>
                </div>
              ))}
            </div>

            <InfoBox>
              <strong style={{ color: "var(--doc-gold)" }}>Never retry 4xx errors except 429.</strong> A 400/401/404 means the request itself is malformed — retrying will just produce the same error. Fix the payload or credentials first.
            </InfoBox>
          </Section>
          </div>

          {/* ═══ HEALTH CHECK ═══ */}
          <div id="health-check" style={{ scrollMarginTop: 20 }}>
          <Section title="Health Check">
            <p style={{ fontSize: 14, color: "var(--doc-text-secondary)", marginBottom: 12 }}>To verify the endpoint is live, send a <Code>GET</Code> request to the same URL:</p>
            <pre style={{ background: "var(--doc-pre-bg)", border: "1px solid var(--doc-border)", borderRadius: 12, padding: "12px 20px", fontSize: 13, color: "var(--doc-pre-text)", overflowX: "auto", margin: 0 }}>
              GET https://fintella.partners/api/webhook/referral
            </pre>
            <p style={{ fontSize: 13, color: "var(--doc-text-muted)", marginTop: 8 }}>Returns a JSON object with field documentation and endpoint status.</p>
          </Section>
          </div>

          {/* Footer */}
          <div style={{ borderTop: "1px solid var(--doc-border)", paddingTop: 20, marginTop: 48, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--doc-text-faint)" }}>
            <span>Fintella Partner Portal &mdash; Webhook Integration Guide</span>
            <span>Last updated: April 14, 2026</span>
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
