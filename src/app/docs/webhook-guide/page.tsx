import { Metadata } from "next";

export const metadata: Metadata = {
  title: "TRLN Webhook Integration Guide",
  description: "Referral webhook integration guide for Frost Law",
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-white/10 text-[#f0d070] px-1.5 py-0.5 rounded text-[13px] font-mono">
      {children}
    </code>
  );
}

function FieldBadge({ children }: { children: string }) {
  return (
    <span className="inline-block bg-white/[0.06] border border-white/10 text-white/80 px-2 py-0.5 rounded text-[12px] font-mono mr-1.5 mb-1.5">
      {children}
    </span>
  );
}

export default function WebhookGuidePage() {
  return (
    <div className="min-h-screen bg-[#060a18] text-white/90">
      <div className="max-w-[860px] mx-auto px-5 sm:px-8 py-10 sm:py-16">

        {/* Header */}
        <div className="mb-10">
          <div className="font-display text-xl sm:text-2xl font-bold text-[#c4a050] tracking-[2px] mb-1">TRLN</div>
          <div className="text-[13px] text-white/30 mb-8">Tariff Refund &amp; Litigation Network</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Referral Webhook Integration Guide</h1>
          <div className="h-[2px] w-20 bg-[#c4a050] rounded-full" />
        </div>

        {/* Endpoint Details */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c4a050]" />
            Endpoint Details
          </h2>
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden">
            {[
              ["Webhook URL", "https://trln.partners/api/webhook/referral"],
              ["Method", "POST"],
              ["Content-Type", "application/json"],
              ["Security Header", "x-webhook-secret: [provided separately]"],
            ].map(([label, value], i) => (
              <div key={label} className={`flex flex-col sm:flex-row sm:items-center px-5 py-3.5 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}>
                <div className="text-[12px] font-semibold text-white/50 uppercase tracking-wider sm:w-[160px] shrink-0 mb-1 sm:mb-0">{label}</div>
                <div className="font-mono text-[13px] text-white/80 break-all">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-[#c4a050]/[0.08] border border-[#c4a050]/20 rounded-lg px-5 py-3.5 text-[13px] text-white/60 leading-relaxed">
            The security header is required on all requests. The secret token will be provided separately via secure channel. Requests without a valid token will receive a <Code>401 Unauthorized</Code> response.
          </div>
        </section>

        {/* Accepted Fields */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c4a050]" />
            Accepted Fields
          </h2>
          <p className="text-[13px] text-white/40 mb-5 leading-relaxed">
            All fields should be sent as a flat JSON object in the POST body. Field names are flexible — the endpoint accepts multiple naming conventions (snake_case, camelCase, or form labels).
          </p>

          <div className="space-y-3">
            {[
              {
                category: "Partner Tracking",
                color: "text-[#c4a050]",
                borderColor: "border-[#c4a050]/20",
                bgColor: "bg-[#c4a050]/[0.04]",
                fields: ["utm_content", "referral_code", "partner_code"],
                desc: "Identifies which TRLN partner referred the client. Passed through from the referral link URL parameter.",
              },
              {
                category: "Client Info",
                color: "text-green-400",
                borderColor: "border-green-400/20",
                bgColor: "bg-green-400/[0.04]",
                fields: ["first_name", "last_name", "email", "phone", "business_title"],
                desc: "Client contact details. At least one of name, email, or company is required.",
              },
              {
                category: "Business",
                color: "text-blue-400",
                borderColor: "border-blue-400/20",
                bgColor: "bg-blue-400/[0.04]",
                fields: ["legal_entity_name", "service_of_interest", "city", "state"],
                desc: "Business/company details and location.",
              },
              {
                category: "Tariff",
                color: "text-purple-400",
                borderColor: "border-purple-400/20",
                bgColor: "bg-purple-400/[0.04]",
                fields: ["imports_goods", "import_countries", "annual_import_value", "importer_of_record"],
                desc: "Tariff-specific qualification fields.",
              },
              {
                category: "Deal Stage",
                color: "text-orange-400",
                borderColor: "border-orange-400/20",
                bgColor: "bg-orange-400/[0.04]",
                fields: ["dealstage", "deal_stage", "stage", "pipeline_stage", "status"],
                desc: "Current stage in your pipeline. Stored exactly as sent (not mapped or transformed).",
              },
              {
                category: "Notes",
                color: "text-white/60",
                borderColor: "border-white/10",
                bgColor: "bg-white/[0.02]",
                fields: ["affiliate_notes"],
                desc: "Any additional notes or comments from the form submission.",
              },
            ].map((row) => (
              <div key={row.category} className={`${row.bgColor} border ${row.borderColor} rounded-xl px-5 py-4`}>
                <div className={`text-[12px] font-semibold uppercase tracking-wider ${row.color} mb-2.5`}>{row.category}</div>
                <div className="mb-2.5 flex flex-wrap">
                  {row.fields.map((f) => <FieldBadge key={f}>{f}</FieldBadge>)}
                </div>
                <div className="text-[13px] text-white/40 leading-relaxed">{row.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Example Request */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c4a050]" />
            Example Request
          </h2>
          <div className="bg-[#0c1228] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              <span className="text-[11px] text-white/30 font-mono">POST /api/webhook/referral</span>
            </div>
            <pre className="px-5 py-4 text-[13px] leading-[1.7] overflow-x-auto text-white/70">
{`{
  `}<span className="text-[#c4a050]">&quot;utm_content&quot;</span>{`:        `}<span className="text-green-300">&quot;PTNABC123&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;first_name&quot;</span>{`:        `}<span className="text-green-300">&quot;Jane&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;last_name&quot;</span>{`:         `}<span className="text-green-300">&quot;Smith&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;email&quot;</span>{`:             `}<span className="text-green-300">&quot;jane@acmeimports.com&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;phone&quot;</span>{`:             `}<span className="text-green-300">&quot;(555) 123-4567&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;business_title&quot;</span>{`:    `}<span className="text-green-300">&quot;CFO&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;legal_entity_name&quot;</span>{`: `}<span className="text-green-300">&quot;Acme Imports LLC&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;service_of_interest&quot;</span>{`:`}<span className="text-green-300">&quot;Tariff Refund Support&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;city&quot;</span>{`:              `}<span className="text-green-300">&quot;Phoenix&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;state&quot;</span>{`:             `}<span className="text-green-300">&quot;AZ&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;imports_goods&quot;</span>{`:     `}<span className="text-green-300">&quot;Yes&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;import_countries&quot;</span>{`:  `}<span className="text-green-300">&quot;China, Vietnam&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;annual_import_value&quot;</span>{`:`}<span className="text-green-300">&quot;$1M - $5M&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;importer_of_record&quot;</span>{`: `}<span className="text-green-300">&quot;Acme Imports LLC&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;dealstage&quot;</span>{`:         `}<span className="text-green-300">&quot;Qualified&quot;</span>{`,
  `}<span className="text-[#c4a050]">&quot;affiliate_notes&quot;</span>{`:   `}<span className="text-green-300">&quot;Referred by CPA network&quot;</span>{`
}`}
            </pre>
          </div>
        </section>

        {/* Responses */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c4a050]" />
            Responses
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[13px] font-semibold text-green-400">201 Created</span>
              </div>
              <pre className="bg-[#0c1228] border border-white/[0.08] rounded-xl px-5 py-4 text-[13px] leading-[1.7] text-white/70 overflow-x-auto">
{`{
  "received": true,
  "dealId": "clx1234...",
  "dealName": "Acme Imports LLC",
  "partnerCode": "PTNABC123"
}`}
              </pre>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-[13px] font-semibold text-yellow-400">400 Validation Error</span>
              </div>
              <pre className="bg-[#0c1228] border border-white/[0.08] rounded-xl px-5 py-4 text-[13px] leading-[1.7] text-white/70 overflow-x-auto">
{`{
  "error": "At least one of: name, email, or company is required"
}`}
              </pre>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[13px] font-semibold text-red-400">401 Unauthorized</span>
              </div>
              <pre className="bg-[#0c1228] border border-white/[0.08] rounded-xl px-5 py-4 text-[13px] leading-[1.7] text-white/70 overflow-x-auto">
{`{
  "error": "Unauthorized"
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* How Partner Tracking Works */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c4a050]" />
            How Partner Tracking Works
          </h2>

          <div className="space-y-3">
            {[
              { step: "1", text: <>TRLN partners share a referral link:<br /><span className="font-mono text-[12px] text-[#c4a050]/80 break-all">https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content=PTNABC123</span></> },
              { step: "2", text: "The client fills out the Frost Law referral form" },
              { step: "3", text: <>The form system passes the <Code>utm_content</Code> value through to the webhook payload</> },
              { step: "4", text: "TRLN records the deal and attributes it to the correct partner" },
              { step: "5", text: "The partner sees the deal in their portal dashboard" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#c4a050]/15 border border-[#c4a050]/25 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[12px] font-bold text-[#c4a050]">{item.step}</span>
                </div>
                <div className="text-[14px] text-white/60 leading-relaxed pt-0.5">{item.text}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 bg-[#c4a050]/[0.08] border border-[#c4a050]/20 rounded-lg px-5 py-3.5 text-[13px] text-white/60 leading-relaxed">
            If <Code>utm_content</Code> is not present in the payload, the deal is still created and stored as &quot;UNATTRIBUTED&quot; so no leads are lost.
          </div>
        </section>

        {/* Health Check */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c4a050]" />
            Health Check
          </h2>
          <p className="text-[14px] text-white/50 mb-3">To verify the endpoint is live, send a <Code>GET</Code> request to the same URL:</p>
          <pre className="bg-[#0c1228] border border-white/[0.08] rounded-xl px-5 py-3 text-[13px] text-white/70 overflow-x-auto">
            GET https://trln.partners/api/webhook/referral
          </pre>
          <p className="text-[13px] text-white/40 mt-2">Returns a JSON object with field documentation and endpoint status.</p>
        </section>

        {/* Footer */}
        <div className="border-t border-white/[0.06] pt-5 mt-12 flex items-center justify-between">
          <div className="text-[11px] text-white/20">TRLN Partner Portal &mdash; Webhook Integration Guide</div>
          <div className="text-[11px] text-white/20">April 2026</div>
        </div>
      </div>
    </div>
  );
}
