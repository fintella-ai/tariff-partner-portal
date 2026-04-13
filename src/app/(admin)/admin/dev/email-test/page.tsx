"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type TemplateType = "welcome" | "agreement_signed" | "deal_received" | "payout_processed" | "admin_oneoff";

const TEMPLATES: { value: TemplateType; label: string; description: string }[] = [
  {
    value: "welcome",
    label: "Welcome (signup)",
    description: "Sent when a new partner completes signup at /signup",
  },
  {
    value: "agreement_signed",
    label: "Agreement signed",
    description: "Sent when SignWell webhook fires document_completed",
  },
  {
    value: "deal_received",
    label: "Deal received (referral webhook)",
    description: "Sent when Frost Law referral form attributes a deal to a partner",
  },
  {
    value: "payout_processed",
    label: "Payout processed",
    description: "Sent when admin marks a payout batch as processed",
  },
  {
    value: "admin_oneoff",
    label: "Admin one-off (manual send)",
    description: "Generic template used by the partner detail page Send Email button",
  },
];

interface ConfigStatus {
  isConfigured: boolean;
  fromAddress: { email: string; name: string };
}

interface SendResult {
  ok: boolean;
  status: "sent" | "failed" | "demo" | "skipped_optout";
  messageId: string | null;
  errorMessage: string | null;
  emailLogId: string | null;
  sentTo: string;
  templateType: TemplateType;
  fromAddress: { email: string; name: string };
  isConfigured: boolean;
}

export default function EmailTestPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";

  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [templateType, setTemplateType] = useState<TemplateType>("welcome");
  const [toEmail, setToEmail] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/admin/dev/email-test")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => setConfig(null));
  }, [isSuperAdmin]);

  // Pre-fill toEmail with the admin's own email once session loads
  useEffect(() => {
    if (session?.user?.email && !toEmail) {
      setToEmail(session.user.email);
    }
  }, [session, toEmail]);

  async function sendTest() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/dev/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType,
          toEmail: toEmail.trim(),
          partnerCode: partnerCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({
        ok: false,
        status: "failed",
        messageId: null,
        errorMessage: err?.message || "Network error",
        emailLogId: null,
        sentTo: toEmail,
        templateType,
        fromAddress: config?.fromAddress || { email: "", name: "" },
        isConfigured: config?.isConfigured || false,
      });
    } finally {
      setSending(false);
    }
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
          Email Test Harness
        </h2>
        <p className="font-body text-[13px] theme-text-muted">
          Send a test email through <code className="text-brand-gold">src/lib/sendgrid.ts</code>{" "}
          using one of the production templates. Use this to verify SendGrid is
          wired correctly post-deploy without going through the full signup or
          webhook flow.
        </p>
      </div>

      {/* Configuration status */}
      <div className="card p-5 mb-5">
        <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-3">
          SendGrid Configuration
        </div>
        {config ? (
          <div className="space-y-2 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${
                  config.isConfigured
                    ? "bg-green-500/15 text-green-400 border border-green-500/30"
                    : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                }`}
              >
                {config.isConfigured ? "✓ LIVE" : "○ DEMO MODE"}
              </span>
              <span className="theme-text-muted">
                {config.isConfigured
                  ? "SENDGRID_API_KEY is set — real emails will be delivered"
                  : "SENDGRID_API_KEY not set — sends will be logged but no real email will be delivered"}
              </span>
            </div>
            <div className="theme-text-secondary">
              From: <span className="text-brand-gold">{config.fromAddress.name} &lt;{config.fromAddress.email}&gt;</span>
            </div>
          </div>
        ) : (
          <div className="font-body text-[11px] theme-text-muted">Loading configuration…</div>
        )}
      </div>

      {/* Template selector */}
      <div className="card p-5 mb-5">
        <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-3">
          Email Template
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTemplateType(t.value)}
              className={`text-left border rounded-lg px-4 py-3 transition-all ${
                templateType === t.value
                  ? "bg-brand-gold/15 border-brand-gold/30"
                  : "bg-[var(--app-input-bg)] border-[var(--app-border)] hover:border-brand-gold/30"
              }`}
            >
              <div className="font-body text-[13px] font-medium text-[var(--app-text)]">
                {t.label}
              </div>
              <div className="font-body text-[11px] theme-text-muted mt-0.5">
                {t.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recipient + partner code */}
      <div className="card p-5 mb-5">
        <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-3">
          Recipient
        </div>
        <div className="space-y-3">
          <div>
            <label className="block font-body text-[11px] theme-text-muted mb-1.5">
              To Email
            </label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-sm text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors"
            />
          </div>
          <div>
            <label className="block font-body text-[11px] theme-text-muted mb-1.5">
              Partner Code <span className="text-[var(--app-text-faint)]">(optional — used for opt-in lookup + EmailLog attribution)</span>
            </label>
            <input
              type="text"
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
              placeholder="PTNXXXXXX (leave blank for unattributed test)"
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-mono text-sm text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors"
            />
            <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1.5">
              Test sends always bypass the opt-in gate, so you can use any partner code or leave it blank.
            </div>
          </div>
        </div>
      </div>

      {/* Send button */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={sendTest}
          disabled={sending || !toEmail.trim() || !toEmail.includes("@")}
          className="flex-1 bg-brand-gold/20 border border-brand-gold/30 text-brand-gold rounded-lg py-3 font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
        >
          {sending ? "Sending..." : `Send Test Email (${templateType})`}
        </button>
      </div>

      {/* Response */}
      {result && (
        <div className="card overflow-hidden mb-5">
          <div
            className={`px-5 py-3 border-b border-[var(--app-border)] flex items-center justify-between gap-2 flex-wrap ${
              result.status === "sent"
                ? "bg-green-500/5"
                : result.status === "demo"
                ? "bg-yellow-500/5"
                : result.status === "skipped_optout"
                ? "bg-[var(--app-card-bg)]"
                : "bg-red-500/5"
            }`}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`font-body text-[11px] font-bold uppercase tracking-wider rounded px-2 py-1 ${
                  result.status === "sent"
                    ? "bg-green-500/15 text-green-400 border border-green-500/30"
                    : result.status === "demo"
                    ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                    : result.status === "skipped_optout"
                    ? "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] border border-[var(--app-border)]"
                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                }`}
              >
                {result.status}
              </span>
              <span className="font-mono text-[11px] theme-text-muted">
                → {result.sentTo}
              </span>
            </div>
            {result.messageId && (
              <span className="font-mono text-[10px] theme-text-muted">
                msg: {result.messageId}
              </span>
            )}
          </div>
          <div className="px-5 py-4">
            <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">
              Result
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
              {JSON.stringify(result, null, 2)}
            </pre>
            {result.emailLogId && (
              <div className="mt-3 font-body text-[11px] theme-text-muted">
                EmailLog row created with id <code className="text-brand-gold">{result.emailLogId}</code>.
                {partnerCode && (
                  <>
                    {" "}View it in the partner detail page communication log.
                  </>
                )}
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
            All sends go through <code className="text-brand-gold">src/lib/sendgrid.ts</code>, the
            same module used by the signup, SignWell webhook, referral webhook,
            and payout-processed trigger points. If this works, those work.
          </li>
          <li>
            Test sends always bypass the partner <code>emailOptIn</code> gate.
            Real automated sends respect it.
          </li>
          <li>
            The subject is prefixed with <code className="text-brand-gold">[TEST]</code> and the
            body is prefixed with a <code>*** This is a TEST email ***</code>{" "}
            line so it's obvious in the recipient's inbox that this came from
            the harness, not a real trigger.
          </li>
          <li>
            Status <code className="text-yellow-400">demo</code> means
            SENDGRID_API_KEY is not set — the email is logged to the EmailLog
            table but no actual email is delivered. To go live, set
            SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, and SENDGRID_FROM_NAME in
            Vercel env vars (Production scope) and redeploy.
          </li>
          <li>
            Every send writes an EmailLog row regardless of result, including
            failures and opt-out skips. View them in the partner detail page
            Email tab.
          </li>
        </ul>
      </div>
    </div>
  );
}
