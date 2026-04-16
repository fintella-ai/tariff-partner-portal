"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Method = "POST" | "PATCH" | "GET";

interface TestResponse {
  status: number;
  statusText: string;
  ok: boolean;
  url: string;
  method: string;
  body: any;
  secretInjected: boolean;
}

// ─── PRESETS ──────────────────────────────────────────────────────────────
const PRESETS: { label: string; description: string; payload: any }[] = [
  {
    label: "Minimal (new lead)",
    description: "Smallest valid payload — just partner code + client name",
    payload: {
      utm_content: "DEMO01",
      first_name: "Jane",
      last_name: "Doe",
      legal_entity_name: "Acme Imports LLC",
    },
  },
  {
    label: "Full lead",
    description: "Complete payload with all common fields",
    payload: {
      utm_content: "DEMO01",
      first_name: "John",
      last_name: "Smith",
      email: "john@acmeimports.com",
      phone: "+14105551234",
      business_title: "VP of Supply Chain",
      legal_entity_name: "Acme Imports LLC",
      service_of_interest: "Tariff Refund Support",
      city: "Baltimore",
      state: "MD",
      imports_goods: "Yes",
      import_countries: "China, Vietnam",
      annual_import_value: "$5M - $10M",
      importer_of_record: "Acme Imports LLC",
      affiliate_notes: "Referred via weekly networking event. Strong fit.",
      stage: "new_lead",
    },
  },
  {
    label: "Consultation booked",
    description: "Full lead that's already scheduled a consultation",
    payload: {
      utm_content: "DEMO01",
      first_name: "Maria",
      last_name: "Garcia",
      email: "maria@globalmanuf.com",
      legal_entity_name: "Global Manufacturing Co",
      service_of_interest: "Tariff Refund Support",
      city: "Los Angeles",
      state: "CA",
      imports_goods: "Yes",
      annual_import_value: "$10M - $25M",
      stage: "consultation_booked",
      consult_booked_date: "2026-05-15",
      consult_booked_time: "14:00",
    },
  },
  {
    label: "Closed won",
    description: "Deal that has closed and is ready for commission",
    payload: {
      utm_content: "DEMO01",
      first_name: "Robert",
      last_name: "Chen",
      email: "robert@pacificimports.com",
      legal_entity_name: "Pacific Imports Inc",
      service_of_interest: "Tariff Refund Support",
      stage: "closedwon",
    },
  },
];

const PATCH_PRESETS: { label: string; description: string; payload: any }[] = [
  {
    label: "Move to consultation_booked",
    description: "Update stage + add consultation date/time",
    payload: {
      dealId: "REPLACE_WITH_DEAL_ID",
      stage: "consultation_booked",
      consult_booked_date: "2026-05-15",
      consult_booked_time: "14:00",
    },
  },
  {
    label: "Move to client_engaged",
    description: "Deal has signed retainer",
    payload: {
      dealId: "REPLACE_WITH_DEAL_ID",
      stage: "client_engaged",
    },
  },
  {
    label: "Closed won",
    description: "Refund recovered",
    payload: {
      dealId: "REPLACE_WITH_DEAL_ID",
      stage: "closedwon",
    },
  },
  {
    label: "Closed lost",
    description: "Deal dropped with reason",
    payload: {
      dealId: "REPLACE_WITH_DEAL_ID",
      stage: "closedlost",
      closed_lost_reason: "Client chose a competitor",
    },
  },
];

export default function WebhookTestPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";

  const [method, setMethod] = useState<Method>("POST");
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(PRESETS[0].payload, null, 2)
  );
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [parseError, setParseError] = useState<string>("");

  // Parse payload text into an object (or null if invalid)
  const parsedPayload = useMemo(() => {
    if (method === "GET") return null;
    try {
      const obj = JSON.parse(payloadText);
      return obj;
    } catch {
      return null;
    }
  }, [payloadText, method]);

  function loadPreset(preset: { payload: any }) {
    setPayloadText(JSON.stringify(preset.payload, null, 2));
    setParseError("");
    setResponse(null);
  }

  function switchMethod(newMethod: Method) {
    setMethod(newMethod);
    setResponse(null);
    setParseError("");
    if (newMethod === "POST") {
      setPayloadText(JSON.stringify(PRESETS[0].payload, null, 2));
    } else if (newMethod === "PATCH") {
      setPayloadText(JSON.stringify(PATCH_PRESETS[0].payload, null, 2));
    } else {
      setPayloadText("");
    }
  }

  async function sendRequest() {
    setSending(true);
    setParseError("");
    setResponse(null);

    let payload: any = undefined;
    if (method !== "GET") {
      try {
        payload = JSON.parse(payloadText);
      } catch (e: any) {
        setParseError(`Invalid JSON: ${e?.message || "parse error"}`);
        setSending(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/admin/dev/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResponse({
          status: res.status,
          statusText: res.statusText,
          ok: false,
          url: "/api/admin/dev/webhook-test",
          method,
          body: data,
          secretInjected: false,
        });
      } else {
        setResponse(data as TestResponse);
      }
    } catch (err: any) {
      setResponse({
        status: 0,
        statusText: "Network error",
        ok: false,
        url: "",
        method,
        body: { error: err?.message || "Network error" },
        secretInjected: false,
      });
    } finally {
      setSending(false);
    }
  }

  function viewDealInAdmin() {
    const dealId = response?.body?.dealId;
    if (!dealId) return;
    router.push(`/admin/deals?deal=${dealId}`);
  }

  function loadDealIdIntoPatch() {
    const dealId = response?.body?.dealId;
    if (!dealId) return;
    switchMethod("PATCH");
    const preset = { ...PATCH_PRESETS[0].payload, dealId };
    setPayloadText(JSON.stringify(preset, null, 2));
    setResponse(null);
  }

  if (!isSuperAdmin) {
    return (
      <div className="card p-12 text-center">
        <div className="font-body text-sm theme-text-muted">
          This page is restricted to super admins only.
        </div>
      </div>
    );
  }

  const activePresets = method === "PATCH" ? PATCH_PRESETS : PRESETS;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/admin/dev")}
          className="font-body text-[11px] theme-text-muted hover:text-brand-gold transition-colors mb-2"
        >
          ← Back to Development
        </button>
        <h2 className="font-display text-[22px] font-bold mb-1">
          Webhook Test Harness
        </h2>
        <p className="font-body text-[13px] theme-text-muted">
          Send test requests to <code className="text-brand-gold">/api/webhook/referral</code> with
          automatic server-side injection of <code>REFERRAL_WEBHOOK_SECRET</code>. Use this to
          verify the webhook works end-to-end before handing the integration to Frost Law.
        </p>
      </div>

      {/* Method selector */}
      <div className="card p-5 mb-5">
        <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-3">
          Request Method
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["POST", "PATCH", "GET"] as Method[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMethod(m)}
              className={`font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2 transition-all min-h-[44px] ${
                method === m
                  ? "bg-brand-gold/15 border-brand-gold/30 text-brand-gold"
                  : "border-[var(--app-border)] theme-text-muted hover:text-[var(--app-text)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="font-body text-[11px] theme-text-muted mt-3">
          {method === "POST" && "Create a new deal. Returns the generated dealId."}
          {method === "PATCH" && "Update an existing deal by dealId. Use an existing deal's ID from a POST response or from /admin/deals."}
          {method === "GET" && "Health check. Returns endpoint status and field documentation."}
        </div>
      </div>

      {/* Presets */}
      {method !== "GET" && (
        <div className="card p-5 mb-5">
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-3">
            Presets
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activePresets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => loadPreset(preset)}
                className="text-left bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-4 py-3 hover:border-brand-gold/30 transition-all"
              >
                <div className="font-body text-[13px] font-medium text-[var(--app-text)]">
                  {preset.label}
                </div>
                <div className="font-body text-[11px] theme-text-muted mt-0.5">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Payload editor */}
      {method !== "GET" && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted">
              Request Payload (JSON)
            </div>
            <div className="font-body text-[10px] theme-text-muted">
              {parsedPayload ? (
                <span className="text-green-400">✓ Valid JSON</span>
              ) : (
                <span className="text-red-400">✗ Invalid JSON</span>
              )}
            </div>
          </div>
          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-mono text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors resize-y"
          />
          {parseError && (
            <div className="mt-2 font-body text-[11px] text-red-400">{parseError}</div>
          )}
        </div>
      )}

      {/* Send button */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={sendRequest}
          disabled={sending || (method !== "GET" && !parsedPayload)}
          className="flex-1 bg-brand-gold/20 border border-brand-gold/30 text-brand-gold rounded-lg py-3 font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
        >
          {sending ? "Sending..." : `Send ${method} to /api/webhook/referral`}
        </button>
      </div>

      {/* Response */}
      {response && (
        <div className="card overflow-hidden mb-5">
          <div
            className={`px-5 py-3 border-b border-[var(--app-border)] flex items-center justify-between gap-2 flex-wrap ${
              response.ok
                ? "bg-green-500/5"
                : "bg-red-500/5"
            }`}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`font-body text-[11px] font-bold uppercase tracking-wider rounded px-2 py-1 ${
                  response.ok
                    ? "bg-green-500/15 text-green-400 border border-green-500/30"
                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                }`}
              >
                {response.status || "ERR"} {response.statusText}
              </span>
              <span className="font-mono text-[11px] theme-text-muted">
                {response.method} {response.url}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {response.secretInjected && (
                <span
                  className="font-body text-[10px] text-brand-gold bg-brand-gold/10 border border-brand-gold/20 rounded px-2 py-0.5"
                  title="REFERRAL_WEBHOOK_SECRET was injected from server env"
                >
                  🔐 SECRET INJECTED
                </span>
              )}
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
              Response Body
            </div>
            <pre
              className="font-mono text-[11px] text-[var(--app-text)] overflow-x-auto whitespace-pre-wrap break-all"
              style={{
                background: "var(--app-input-bg)",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid var(--app-border)",
                margin: 0,
              }}
            >
              {typeof response.body === "string"
                ? response.body
                : JSON.stringify(response.body, null, 2)}
            </pre>

            {/* Success actions for POST */}
            {response.ok && method === "POST" && response.body?.dealId && (
              <div className="mt-4 flex gap-2 flex-wrap">
                <button
                  onClick={viewDealInAdmin}
                  className="font-body text-[12px] font-semibold bg-brand-gold/15 border border-brand-gold/30 text-brand-gold rounded-lg px-4 py-2 hover:bg-brand-gold/25 transition-colors min-h-[44px]"
                >
                  View Deal in Admin ↗
                </button>
                <button
                  onClick={loadDealIdIntoPatch}
                  className="font-body text-[12px] font-semibold border border-[var(--app-border)] theme-text-secondary rounded-lg px-4 py-2 hover:border-brand-gold/30 hover:text-[var(--app-text)] transition-colors min-h-[44px]"
                >
                  Test PATCH on this deal →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Help box */}
      <div className="card p-5">
        <div className="font-body text-[11px] uppercase tracking-wider theme-text-muted mb-2">
          How it works
        </div>
        <ul className="font-body text-[12px] theme-text-secondary space-y-1.5 list-disc list-inside">
          <li>
            Your payload is proxied through <code className="text-brand-gold">/api/admin/dev/webhook-test</code> (super_admin only) which injects the <code>REFERRAL_WEBHOOK_SECRET</code> header server-side.
          </li>
          <li>
            The proxy then calls the real public webhook at <code className="text-brand-gold">/api/webhook/referral</code> exactly as Frost Law would — same auth, same handlers, same DB writes.
          </li>
          <li>
            If <code>REFERRAL_WEBHOOK_SECRET</code> is set in Vercel env vars, you'll see a <span className="text-brand-gold">🔐 SECRET INJECTED</span> badge on the response.
          </li>
          <li>
            A successful POST creates a real deal in your database. Use the "View Deal" button to inspect it, or delete it from <code className="text-brand-gold">/admin/deals</code> if it was just a test.
          </li>
          <li>
            Public webhook guide (what Frost Law sees): <a href="/docs/webhook-guide" target="_blank" className="text-brand-gold hover:underline">/docs/webhook-guide ↗</a>
          </li>
        </ul>
      </div>
    </div>
  );
}
