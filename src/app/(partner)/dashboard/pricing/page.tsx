"use client";

import { useState, useEffect } from "react";

interface PlanConfig {
  id: string;
  name: string;
  priceMonthly: number;
  priceDisplay: string;
  features: string[];
}

interface SubscriptionData {
  plan: string;
  status: string;
  cardLast4: string | null;
  cardBrand: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Record<string, PlanConfig>>({});
  const [currentPlan, setCurrentPlan] = useState<PlanConfig | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [gatewayConfigured, setGatewayConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/partner/subscription")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setPlans(data.plans || {});
          setCurrentPlan(data.currentPlan || null);
          setSubscription(data.subscription || null);
          setGatewayConfigured(data.gatewayConfigured || false);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade() {
    setUpgrading(true);
    setMessage("");
    const res = await fetch("/api/partner/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upgrade", plan: "pro" }),
    });
    if (res.ok) {
      const data = await res.json();
      setCurrentPlan(data.plan);
      setSubscription({ plan: "pro", status: "active", cardLast4: null, cardBrand: null, currentPeriodEnd: null, canceledAt: null });
      setMessage("Upgraded to Pro!");
    } else {
      const err = await res.json().catch(() => ({}));
      setMessage(err.error || "Upgrade failed");
    }
    setUpgrading(false);
  }

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel your Pro subscription?")) return;
    setCanceling(true);
    const res = await fetch("/api/partner/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (res.ok) {
      setCurrentPlan(plans.free || null);
      setSubscription(null);
      setMessage("Subscription canceled. You'll retain Pro access until the end of your billing period.");
    }
    setCanceling(false);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-64 bg-[var(--app-card-bg)] rounded-xl animate-pulse" />
      </div>
    );
  }

  const isPro = currentPlan?.id === "pro" || currentPlan?.id === "enterprise";
  const planList = Object.values(plans);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h1
          className="text-2xl sm:text-3xl font-bold mb-2"
          style={{ color: "var(--app-text)", fontFamily: "'DM Serif Display', Georgia, serif" }}
        >
          Choose Your Plan
        </h1>
        <p className="font-body text-sm text-[var(--app-text-muted)]">
          Free calculator forever. Upgrade for unlimited entries, bulk uploads, and premium features.
        </p>
        {currentPlan && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] font-medium bg-[var(--brand-gold)]/10 text-[var(--brand-gold)]">
            Current plan: {currentPlan.name}
          </div>
        )}
      </div>

      {message && (
        <div className="mb-6 p-3 rounded-lg text-center text-sm font-medium bg-green-500/10 text-green-400 border border-green-500/20">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {planList.map((plan) => {
          const isCurrent = currentPlan?.id === plan.id;
          const isPopular = plan.id === "pro";

          return (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 relative flex flex-col ${
                isPopular
                  ? "border-[var(--brand-gold)] shadow-[0_0_30px_rgba(176,140,48,0.15)]"
                  : "border-[var(--app-border)]"
              }`}
              style={{ background: "var(--app-card-bg)" }}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[var(--brand-gold)] text-black">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="font-body text-lg font-bold text-[var(--app-text)] mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  {plan.priceMonthly > 0 ? (
                    <>
                      <span
                        className="text-3xl font-bold"
                        style={{ color: "var(--brand-gold)", fontFamily: "'DM Serif Display', Georgia, serif" }}
                      >
                        ${(plan.priceMonthly / 100).toFixed(0)}
                      </span>
                      <span className="font-body text-sm text-[var(--app-text-muted)]">/month</span>
                    </>
                  ) : plan.id === "enterprise" ? (
                    <span className="text-2xl font-bold text-[var(--app-text)]">Custom</span>
                  ) : (
                    <span className="text-3xl font-bold text-green-400">Free</span>
                  )}
                </div>
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" style={{ color: isPopular ? "var(--brand-gold)" : "var(--app-text-muted)" }}>
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="font-body text-[13px] text-[var(--app-text)]">{f}</span>
                  </li>
                ))}
              </ul>

              {plan.id === "free" && (
                <button
                  disabled={isCurrent}
                  className="w-full h-11 rounded-xl font-body text-sm font-medium border transition-colors disabled:opacity-40"
                  style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}
                >
                  {isCurrent ? "Current Plan" : "Downgrade"}
                </button>
              )}
              {plan.id === "pro" && (
                isCurrent ? (
                  <button
                    onClick={handleCancel}
                    disabled={canceling}
                    className="w-full h-11 rounded-xl font-body text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    {canceling ? "Canceling..." : "Cancel Subscription"}
                  </button>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="w-full h-11 rounded-xl font-body text-sm font-semibold transition-all disabled:opacity-40"
                    style={{
                      background: "var(--brand-gold)",
                      color: "#000",
                      boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
                    }}
                  >
                    {upgrading ? "Processing..." : "Upgrade to Pro"}
                  </button>
                )
              )}
              {plan.id === "enterprise" && (
                <a
                  href="mailto:partnerships@fintella.partners?subject=Enterprise Plan Inquiry"
                  className="w-full h-11 rounded-xl font-body text-sm font-medium border flex items-center justify-center transition-colors hover:bg-white/3"
                  style={{ borderColor: "var(--brand-gold)", color: "var(--brand-gold)" }}
                >
                  Contact Sales
                </a>
              )}
            </div>
          );
        })}
      </div>

      {!gatewayConfigured && (
        <div className="mt-6 p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 text-center">
          <p className="font-body text-[12px] text-yellow-400">
            Payment gateway not configured. Set NMI_API_KEY on Vercel to enable card payments.
            Until then, upgrades are recorded but not charged.
          </p>
        </div>
      )}

      {subscription?.canceledAt && (
        <div className="mt-6 p-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)] text-center">
          <p className="font-body text-sm text-[var(--app-text-muted)]">
            Your Pro subscription was canceled. You retain access until {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "the end of your billing period"}.
          </p>
        </div>
      )}

      <div className="mt-12 text-center">
        <p className="font-body text-[11px] text-[var(--app-text-muted)]">
          All plans include the free IEEPA calculator and CAPE CSV generator. Upgrade or downgrade anytime.
          Questions? Email partnerships@fintella.partners.
        </p>
      </div>
    </div>
  );
}
