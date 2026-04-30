"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ApplyForm() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [partnerType, setPartnerType] = useState("customs_broker");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName || !lastName || !email) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: phone || undefined,
          companyName: companyName || undefined,
          website: website || undefined,
          referralSource: plan ? `pricing_${plan}` : "apply_page",
          utm_source: searchParams.get("utm_source") || undefined,
          utm_medium: searchParams.get("utm_medium") || undefined,
          utm_campaign: searchParams.get("utm_campaign") || undefined,
          utm_content: searchParams.get("utm_content") || undefined,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.alreadyPartner) {
          setError("You already have a partner account. Sign in to your portal.");
        } else if (data.alreadyApplied) {
          setError("Application already received. We'll be in touch soon.");
        } else {
          setError(data.error || "Something went wrong. Please try again.");
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--app-bg)" }}
      >
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1
            className="text-2xl font-bold mb-3"
            style={{ color: "var(--app-text)", fontFamily: "'DM Serif Display', Georgia, serif" }}
          >
            Application Received
          </h1>
          <p className="font-body text-sm mb-6" style={{ color: "var(--app-text-muted)" }}>
            Thank you, {firstName}! We&apos;ll review your application and be in touch within 24 hours.
            In the meantime, try our free calculator.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/calculator"
              className="h-11 rounded-xl font-body text-sm font-semibold flex items-center justify-center"
              style={{ background: "var(--brand-gold)", color: "#000" }}
            >
              Try the Free Calculator
            </Link>
            <Link
              href="/partners/brokers"
              className="h-11 rounded-xl font-body text-sm font-medium flex items-center justify-center border"
              style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      {/* Header */}
      <header className="border-b" style={{ borderColor: "var(--app-border-subtle)" }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-bold tracking-wide"
            style={{ color: "var(--brand-gold)", fontFamily: "'DM Serif Display', Georgia, serif" }}
          >
            FINTELLA
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/calculator" className="font-body text-sm" style={{ color: "var(--app-text-muted)" }}>
              Calculator
            </Link>
            <Link href="/login" className="font-body text-sm" style={{ color: "var(--app-text-muted)" }}>
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left — Value prop */}
        <div className="py-8">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium mb-4"
            style={{ background: "rgba(176,140,48,0.1)", color: "var(--brand-gold)", border: "1px solid rgba(176,140,48,0.2)" }}
          >
            Free to Join — No Risk
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{ color: "var(--app-text)", fontFamily: "'DM Serif Display', Georgia, serif" }}
          >
            Become a Fintella Partner
          </h1>
          <p className="font-body text-base mb-8" style={{ color: "var(--app-text-muted)" }}>
            Join the network of customs brokers and professionals earning 10-25% commission
            on every IEEPA tariff recovery. Free tools, no cost to join, your clients stay yours.
          </p>

          <div className="space-y-4 mb-8">
            {[
              { icon: "🧮", title: "Free IEEPA Calculator", desc: "Instant refund estimates for your clients" },
              { icon: "📄", title: "AI Document Intake", desc: "Drop a CF 7501 — get results in 30 seconds" },
              { icon: "💰", title: "10-25% Commission", desc: "Earn on every successful recovery" },
              { icon: "🔌", title: "TMS Widget", desc: "Embed directly in CargoWise or Magaya" },
              { icon: "📊", title: "Full Reporting", desc: "Track deals, commissions, and downline" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{item.icon}</span>
                <div>
                  <div className="font-body text-sm font-semibold" style={{ color: "var(--app-text)" }}>{item.title}</div>
                  <div className="font-body text-xs" style={{ color: "var(--app-text-muted)" }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: "rgba(176,140,48,0.05)", border: "1px solid rgba(176,140,48,0.15)" }}
          >
            <span className="text-2xl">💎</span>
            <div>
              <div className="font-body text-sm font-semibold" style={{ color: "var(--brand-gold)" }}>
                $166 Billion Available
              </div>
              <div className="font-body text-xs" style={{ color: "var(--app-text-muted)" }}>
                83% of eligible importers haven&apos;t filed. The clock is ticking.
              </div>
            </div>
          </div>
        </div>

        {/* Right — Form */}
        <div>
          <div
            className="rounded-2xl border p-6 sm:p-8"
            style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}
          >
            <h2 className="font-body text-lg font-bold mb-1" style={{ color: "var(--app-text)" }}>
              Apply Now
            </h2>
            <p className="font-body text-xs mb-6" style={{ color: "var(--app-text-muted)" }}>
              We&apos;ll review your application and get back to you within 24 hours.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm font-body bg-red-500/10 text-red-400 border border-red-500/20">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full h-11 rounded-lg border px-3 font-body text-sm"
                    style={{ background: "var(--app-input-bg)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  />
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full h-11 rounded-lg border px-3 font-body text-sm"
                    style={{ background: "var(--app-input-bg)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                  />
                </div>
              </div>

              <div>
                <label className="block font-body text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                  Business Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-11 rounded-lg border px-3 font-body text-sm"
                  style={{ background: "var(--app-input-bg)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                />
              </div>

              <div>
                <label className="block font-body text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-11 rounded-lg border px-3 font-body text-sm"
                  style={{ background: "var(--app-input-bg)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                />
              </div>

              <div>
                <label className="block font-body text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                  Company
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full h-11 rounded-lg border px-3 font-body text-sm"
                  style={{ background: "var(--app-input-bg)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                />
              </div>

              <div>
                <label className="block font-body text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--app-text-muted)" }}>
                  I am a...
                </label>
                <select
                  value={partnerType}
                  onChange={(e) => setPartnerType(e.target.value)}
                  className="w-full h-11 rounded-lg border px-3 font-body text-sm"
                  style={{ background: "var(--app-input-bg)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
                >
                  <option value="customs_broker">Licensed Customs Broker</option>
                  <option value="referral">Referral Partner</option>
                  <option value="corporate">Corporate / Enterprise</option>
                  <option value="licensed">Attorney / CPA</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting || !firstName || !lastName || !email}
                className="w-full h-12 rounded-xl font-body text-sm font-semibold transition-all disabled:opacity-40"
                style={{
                  background: "var(--brand-gold)",
                  color: "#000",
                  boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
                }}
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            </form>

            <p className="font-body text-[10px] text-center mt-4" style={{ color: "var(--app-text-muted)" }}>
              By applying, you agree to our{" "}
              <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
              We&apos;ll never share your information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
          <div className="animate-spin h-8 w-8 rounded-full border-2" style={{ borderColor: "var(--app-border)", borderTopColor: "var(--brand-gold)" }} />
        </div>
      }
    >
      <ApplyForm />
    </Suspense>
  );
}
