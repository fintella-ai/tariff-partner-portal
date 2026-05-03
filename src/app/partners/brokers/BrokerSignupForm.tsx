"use client";

import { useState, useEffect } from "react";

/* ── Google Ads gtag type ──────────────────────────────────────────── */
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/* ── Props ─────────────────────────────────────────────────────────── */
interface Props {
  variant: string; // "A", "B", or "C"
  rate: number; // 0.10, 0.15, or 0.20
}

/* ── Client count options ──────────────────────────────────────────── */
const CLIENT_COUNT_OPTIONS = ["0-10", "10-25", "25-50", "50+"];

/* ── Component ─────────────────────────────────────────────────────── */
export default function BrokerSignupForm({ variant, rate }: Props) {
  /* Form state */
  const [isBroker, setIsBroker] = useState<boolean | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [clientCount, setClientCount] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  /* UX state */
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  /* UTM params — captured on mount */
  const [utmParams, setUtmParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const params: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = sp.get(key);
      if (v) params[key] = v;
    }
    setUtmParams(params);
  }, []);

  /* ── Submit ────────────────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBroker === null || !firstName || !lastName || !email || !phone || !companyName || !clientCount) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/partners/broker-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBroker,
          firstName,
          lastName,
          email,
          phone,
          companyName,
          clientCount,
          additionalNotes: additionalNotes.trim() || null,
          splitVariant: variant,
          commissionRate: rate,
          ...utmParams,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccess(true);
        /* Fire Google Ads conversion */
        if (window.gtag) {
          window.gtag("event", "conversion", { send_to: "AW-18128579100" });
        }
      } else if (data.alreadyApplied) {
        setError("You've already applied. Check your email for next steps or sign in to your portal.");
      } else if (data.alreadyPartner) {
        setError("You already have a partner account. Sign in to your portal to get started.");
      } else {
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Shared styles ─────────────────────────────────────────────── */
  const labelClass =
    "block font-body text-[10px] uppercase tracking-wider mb-1.5";
  const labelStyle = { color: "var(--app-text-muted)" };

  const inputClass =
    "w-full h-11 rounded-lg border px-3 font-body text-sm outline-none transition-colors focus:border-[var(--brand-gold)]";
  const inputStyle = {
    background: "rgba(0,0,0,0.3)",
    borderColor: "var(--app-border)",
    color: "var(--app-text)",
  };

  /* ── Success state ─────────────────────────────────────────────── */
  if (success) {
    return (
      <div
        id="signup-form"
        className="rounded-2xl p-8 sm:p-10 text-center"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--app-border)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        {/* Checkmark circle */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "rgba(76,175,80,0.12)", border: "1px solid rgba(76,175,80,0.3)" }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h3
          className="text-xl font-bold mb-2"
          style={{ color: "var(--app-text)", fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          Welcome to the Network
        </h3>
        <p className="font-body text-sm mb-1" style={{ color: "var(--app-text-muted)" }}>
          Check your email for next steps.
        </p>
        <p className="font-body text-xs" style={{ color: "var(--app-text-faint)" }}>
          We&apos;ll review your application and get back to you within 24 hours.
        </p>
      </div>
    );
  }

  /* ── Form ───────────────────────────────────────────────────────── */
  const isValid =
    isBroker !== null && firstName && lastName && email && phone && companyName && clientCount;

  return (
    <div
      id="signup-form"
      className="rounded-2xl p-6 sm:p-8"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--app-border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* Heading */}
      <h2
        className="text-lg font-bold mb-1"
        style={{ color: "var(--brand-gold)", fontFamily: "'DM Serif Display', Georgia, serif" }}
      >
        Join the Network
      </h2>
      <p className="font-body text-xs mb-2" style={{ color: "var(--app-text-muted)" }}>
        Free to join. Start referring today.
      </p>
      <div
        className="font-body text-[10px] leading-relaxed mb-6 p-3 rounded-lg"
        style={{
          color: "var(--app-text-secondary)",
          background: "rgba(196,160,80,0.04)",
          border: "1px solid rgba(196,160,80,0.12)",
        }}
      >
        The information you provide below must be accurate and match your legal
        documents. This data will be used to create your partner profile and
        generate your partnership agreement. Inaccurate information may delay
        your application or void your agreement.
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm font-body bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── Licensed broker toggle ────────────────────────────── */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Are you a licensed customs broker? *
          </label>
          <div className="flex gap-2">
            {[
              { label: "Yes", value: true },
              { label: "No", value: false },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setIsBroker(opt.value)}
                className="flex-1 h-11 rounded-lg text-sm font-body transition-all"
                style={{
                  border: `1px solid ${isBroker === opt.value ? "var(--brand-gold)" : "var(--app-border)"}`,
                  background:
                    isBroker === opt.value ? "rgba(196,160,80,0.12)" : "rgba(0,0,0,0.3)",
                  color:
                    isBroker === opt.value ? "var(--brand-gold)" : "var(--app-text-muted)",
                  fontWeight: isBroker === opt.value ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Name row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} style={labelStyle}>
              First Name *
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              placeholder="John"
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={labelClass} style={labelStyle}>
              Last Name *
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              placeholder="Smith"
              className={inputClass}
              style={inputStyle}
            />
          </div>
        </div>

        {/* ── Email ─────────────────────────────────────────────── */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="john@brokerage.com"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {/* ── Phone ─────────────────────────────────────────────── */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Phone *
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="(555) 123-4567"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {/* ── Company ───────────────────────────────────────────── */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Company Name *
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            placeholder="ABC Customs Brokerage"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        {/* ── Client count ──────────────────────────────────────── */}
        <div>
          <label className={labelClass} style={labelStyle}>
            How many import clients do you have? *
          </label>
          <select
            value={clientCount}
            onChange={(e) => setClientCount(e.target.value)}
            required
            className={inputClass}
            style={{ ...inputStyle, appearance: "auto" as React.CSSProperties["appearance"] }}
          >
            <option value="" disabled>
              Select range...
            </option>
            {CLIENT_COUNT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* ── Additional notes ──────────────────────────────────── */}
        <div>
          <label className={labelClass} style={labelStyle}>
            Anything else you&apos;d like us to know? <span style={{ color: "var(--app-text-faint)" }}>(optional)</span>
          </label>
          <textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            rows={3}
            placeholder="Questions, special circumstances, or how we can help..."
            className={inputClass}
            style={{
              background: "rgba(0,0,0,0.3)",
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
              resize: "none",
            }}
          />
        </div>

        {/* ── Submit ────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={submitting || !isValid}
          className="w-full h-12 rounded-full font-body text-sm font-semibold transition-all disabled:opacity-40"
          style={{
            background: "var(--brand-gold)",
            color: "var(--app-button-gold-text)",
            boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
          }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting...
            </span>
          ) : (
            "Become a Partner"
          )}
        </button>

        {/* ── Sub-CTA ───────────────────────────────────────────── */}
        <div className="text-center space-y-1.5">
          <p className="font-body text-[10px]" style={{ color: "var(--app-text-faint)" }}>
            Free to join. Start referring today.
          </p>
          <a
            href="https://fintella.partners/partners/brokers#book-call"
            className="font-body text-xs underline underline-offset-2 transition-colors hover:opacity-80"
            style={{ color: "var(--app-text-muted)" }}
          >
            Have questions? Book a call
          </a>
          <p className="font-body text-[9px] leading-relaxed mt-3 max-w-sm mx-auto" style={{ color: "var(--app-text-faint)" }}>
            By applying, you agree to receive communications about the partner program.
            Fintella does not provide legal, tax, or compliance advice. All recovery cases
            are handled by independent licensed counsel. Commission estimates are not guaranteed
            and depend on case outcomes.
          </p>
        </div>
      </form>
    </div>
  );
}
