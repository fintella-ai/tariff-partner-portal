"use client";

import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "Free",
    period: "forever",
    description: "Everything you need to start recovering IEEPA tariff refunds for your clients.",
    cta: "Get Started Free",
    ctaUrl: "/apply",
    highlight: false,
    aiLabel: "Standard AI assistant",
    features: [
      "IEEPA Tariff Refund Calculator",
      "CAPE CSV File Generation",
      "Pre-Submission Audit (19 checks)",
      "Up to 10 entries per calculation",
      "1 active client dossier",
      "3 PDF client summaries per month",
      "Community support",
      "Legal referral commission",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$149",
    period: "/month",
    description: "For brokers serious about maximizing IEEPA recovery revenue across their full book.",
    cta: "Start Pro",
    ctaUrl: "/apply?plan=pro",
    highlight: true,
    badge: "Most Popular",
    aiLabel: "AI assistant + usage dashboard",
    features: [
      "Everything in Free",
      "Unlimited calculator entries",
      "Bulk CSV upload (500 entries)",
      "Unlimited client dossiers",
      "Unlimited PDF exports",
      "AI Knowledge Base search",
      "Advanced audit analytics",
      "Deadline monitoring alerts",
      "Priority email support",
      "Client summary PDF branding",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large brokerages and trade compliance firms with custom integration needs.",
    cta: "Contact Sales",
    ctaUrl: "mailto:partnerships@fintella.partners?subject=Enterprise Plan Inquiry",
    highlight: false,
    aiLabel: "Full AI governance: tool permissions, audit trail, custom prompts, daily limits",
    features: [
      "Everything in Pro",
      "AI Governance Suite",
      "REST API access for TMS integration",
      "White-label PDF branding",
      "Dedicated account manager",
      "Custom commission structure",
      "Bulk import automation",
      "SLA-backed support",
      "Custom onboarding",
    ],
  },
];

const FAQ = [
  {
    q: "What's included in the free plan?",
    a: "The full IEEPA tariff refund calculator, CAPE CSV generation, and pre-submission audit. You can run up to 10 entries per calculation, create 1 dossier, and generate 3 PDF summaries per month. Plus, you earn commission on every legal referral — free forever.",
  },
  {
    q: "How does the legal referral commission work?",
    a: "When your client needs legal review (CIT litigation, CAPE rejections, complex entries), you refer them through Fintella. Our legal partner handles the case, and you earn 10–25% of the legal fee on every successful recovery. This works on all plans, including Free.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Pro subscriptions can be canceled anytime from your portal. You'll retain Pro access until the end of your billing period. No long-term contracts, no cancellation fees.",
  },
  {
    q: "What does the calculator actually do?",
    a: "It calculates your clients' estimated IEEPA tariff refund based on their entry data (country of origin, entry date, entered value). It checks CAPE eligibility, runs a 19-point pre-submission audit, calculates 19 USC §1505 compound daily interest, and generates a clean CAPE CSV ready for ACE Portal upload.",
  },
  {
    q: "Do I need to be a licensed customs broker?",
    a: "No. Any partner can use the calculator and earn referral commissions. Licensed customs brokers get additional tools (TMS widget integration, CAPE filing workflow) but the core platform works for all partner types.",
  },
  {
    q: "Is my clients' data secure?",
    a: "Yes. All data is encrypted in transit (TLS) and at rest. We're hosted on Vercel with Neon PostgreSQL. We don't share client data with third parties. Entry data is only shared with our legal partner when you explicitly submit for legal review.",
  },
];

export default function PublicPricingPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      {/* Header */}
      <header className="border-b" style={{ borderColor: "var(--app-border-subtle)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="text-xl font-bold tracking-wide"
              style={{ color: "var(--brand-gold)", fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              FINTELLA
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/calculator"
              className="font-body text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors"
            >
              Calculator
            </Link>
            <Link
              href="/login"
              className="font-body text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/apply"
              className="font-body text-sm font-semibold px-4 py-2 rounded-lg transition-all"
              style={{ background: "var(--brand-gold)", color: "#000" }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <h1
          className="text-3xl sm:text-4xl font-bold mb-4"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          Simple, Transparent Pricing
        </h1>
        <p className="font-body text-lg text-[var(--app-text-muted)] max-w-2xl mx-auto">
          Start free with our IEEPA tariff calculator. Upgrade when you need unlimited entries,
          bulk uploads, and premium features.
        </p>
      </section>

      {/* Plans */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 sm:p-8 relative flex flex-col ${
                plan.highlight
                  ? "border-[var(--brand-gold)] shadow-[0_0_40px_rgba(176,140,48,0.12)]"
                  : "border-[var(--app-border)]"
              }`}
              style={{ background: "var(--app-card-bg)" }}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-[var(--brand-gold)] text-black">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="font-body text-lg font-bold mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-3">
                  <span
                    className="text-4xl font-bold"
                    style={{
                      color: plan.highlight ? "var(--brand-gold)" : plan.id === "free" ? "#16a34a" : "var(--app-text)",
                      fontFamily: "'DM Serif Display', Georgia, serif",
                    }}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="font-body text-sm text-[var(--app-text-muted)]">{plan.period}</span>
                  )}
                </div>
                <p className="font-body text-[13px] text-[var(--app-text-muted)] leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <svg
                      className="w-4 h-4 mt-0.5 shrink-0"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      style={{ color: f === "AI Governance Suite" ? "var(--brand-gold)" : plan.highlight ? "var(--brand-gold)" : "#16a34a" }}
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {f === "AI Governance Suite" ? (
                      <span className="font-body text-[13px] font-semibold flex items-center gap-1.5">
                        {f}
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                          style={{ background: "var(--brand-gold)", color: "#000" }}
                        >
                          New
                        </span>
                      </span>
                    ) : (
                      <span className="font-body text-[13px]">{f}</span>
                    )}
                  </li>
                ))}
              </ul>

              {plan.ctaUrl.startsWith("mailto") ? (
                <a
                  href={plan.ctaUrl}
                  className="w-full h-12 rounded-xl font-body text-sm font-semibold flex items-center justify-center border transition-colors hover:bg-white/3"
                  style={{ borderColor: "var(--brand-gold)", color: "var(--brand-gold)" }}
                >
                  {plan.cta}
                </a>
              ) : (
                <Link
                  href={plan.ctaUrl}
                  className={`w-full h-12 rounded-xl font-body text-sm font-semibold flex items-center justify-center transition-all ${
                    plan.highlight ? "" : "border"
                  }`}
                  style={
                    plan.highlight
                      ? { background: "var(--brand-gold)", color: "#000", boxShadow: "0 4px 14px rgba(176,140,48,0.3)" }
                      : { borderColor: "var(--app-border)", color: "var(--app-text)" }
                  }
                >
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* AI Comparison Row */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-10">
        <h2
          className="text-xl font-bold text-center mb-6"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          AI Assistant Comparison
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={`ai-${plan.id}`}
              className={`rounded-xl border p-5 ${
                plan.id === "enterprise"
                  ? "border-[var(--brand-gold)] bg-gradient-to-b from-[rgba(176,140,48,0.06)] to-transparent"
                  : "border-[var(--app-border)]"
              }`}
              style={{ background: plan.id === "enterprise" ? undefined : "var(--app-card-bg)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-[var(--app-text)]">{plan.name}</span>
                {plan.id === "enterprise" && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: "var(--brand-gold)", color: "#000" }}
                  >
                    Premium
                  </span>
                )}
              </div>
              <p className="font-body text-[12px] text-[var(--app-text-muted)] leading-relaxed">
                {plan.aiLabel}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Enterprise AI Governance Explainer */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div
          className="rounded-2xl border p-8 sm:p-10"
          style={{
            borderColor: "var(--brand-gold)",
            background: "linear-gradient(135deg, rgba(176,140,48,0.06), rgba(176,140,48,0.01))",
          }}
        >
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(176,140,48,0.12)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3
                className="text-lg font-bold mb-2"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--brand-gold)" }}
              >
                Enterprise AI Governance
              </h3>
              <p className="font-body text-[13px] text-[var(--app-text-muted)] leading-relaxed mb-4">
                The only partner portal with admin-visible AI controls. Configure exactly which tools each
                AI persona can use, set daily budgets, add custom instructions, and audit every change.
                Built for compliance-first organizations.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: "🔧", label: "Tool Permissions" },
                  { icon: "📋", label: "Audit Trail" },
                  { icon: "💬", label: "Custom Prompts" },
                  { icon: "📊", label: "Daily Limits" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--app-border)]"
                    style={{ background: "var(--app-card-bg)" }}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="font-body text-[11px] font-semibold text-[var(--app-text)]">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Calculator CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div
          className="rounded-2xl border p-8 sm:p-12 text-center"
          style={{
            borderColor: "var(--brand-gold)",
            background: "linear-gradient(135deg, rgba(176,140,48,0.06), rgba(176,140,48,0.01))",
          }}
        >
          <h2
            className="text-2xl font-bold mb-3"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
          >
            Try the Calculator Right Now
          </h2>
          <p className="font-body text-sm text-[var(--app-text-muted)] mb-6 max-w-xl mx-auto">
            No signup required. Enter your client&apos;s import data and see their estimated IEEPA refund in 30 seconds.
          </p>
          <Link
            href="/calculator"
            className="inline-flex items-center gap-2 h-12 px-8 rounded-xl font-body text-sm font-semibold transition-all"
            style={{
              background: "var(--brand-gold)",
              color: "#000",
              boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
            }}
          >
            Open Free Calculator
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <h2
          className="text-2xl font-bold text-center mb-8"
          style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="rounded-xl border group"
              style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}
            >
              <summary className="p-4 sm:p-5 font-body text-sm font-semibold cursor-pointer list-none flex items-center justify-between">
                {item.q}
                <svg className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 font-body text-[13px] text-[var(--app-text-muted)] leading-relaxed">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center"
        style={{ borderColor: "var(--app-border-subtle)" }}
      >
        <p className="font-body text-xs text-[var(--app-text-muted)]">
          &copy; {new Date().getFullYear()} Fintella — Financial Intelligence Network. All rights reserved.
        </p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <Link href="/privacy" className="font-body text-xs text-[var(--app-text-muted)] underline">Privacy</Link>
          <Link href="/terms" className="font-body text-xs text-[var(--app-text-muted)] underline">Terms</Link>
          <Link href="/calculator" className="font-body text-xs text-[var(--app-text-muted)] underline">Calculator</Link>
        </div>
      </footer>
    </div>
  );
}
