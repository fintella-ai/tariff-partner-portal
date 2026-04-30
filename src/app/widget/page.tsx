"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import WidgetDashboard from "@/components/widget/WidgetDashboard";
import WidgetReferralForm from "@/components/widget/WidgetReferralForm";
import WidgetHowItWorks from "@/components/widget/WidgetHowItWorks";
import WidgetFooter from "@/components/widget/WidgetFooter";
import { W, SHADOWS, RADII, glassCardStyle } from "@/components/widget/widget-theme";

const WidgetCalculator = lazy(() => import("@/components/widget/WidgetCalculator"));
const WidgetChat = lazy(() => import("@/components/widget/WidgetChat"));

interface AuthData {
  token: string;
  partnerName: string;
  partnerCode: string;
  commissionRate: number;
}

type Tab = "dashboard" | "calc" | "refer" | "how" | "help";

/* Gold spinner used in Suspense fallbacks and initial load */
function GoldSpinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: `2px solid ${W.gold}`,
          borderTopColor: "transparent",
          animation: "widget-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes widget-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function WidgetContent() {
  const searchParams = useSearchParams();
  const apiKey = searchParams.get("apiKey");
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [referralPrefill, setReferralPrefill] = useState<{
    estimatedImportValue?: string;
    importDateRange?: string;
  } | null>(null);

  const handleCalcToReferral = (data: { estimatedImportValue: string; importDateRange: string }) => {
    setReferralPrefill(data);
    setTab("refer");
  };

  const authenticate = useCallback(async () => {
    if (!apiKey) {
      setError("No API key provided");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/widget/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setError(data.error || "Authentication failed");
        setLoading(false);
        return;
      }
      setAuth({
        token: data.token,
        partnerName: data.partnerName,
        partnerCode: data.partnerCode,
        commissionRate: data.commissionRate,
      });
    } catch {
      setError("Failed to connect");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  /* --- Loading state --- */
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: W.bg }}>
        <GoldSpinner />
      </div>
    );
  }

  /* --- Error state --- */
  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", padding: 24, background: W.bg }}>
        <div
          style={{
            ...glassCardStyle(),
            padding: 24,
            textAlign: "center" as const,
            borderColor: "rgba(239,68,68,0.2)",
            boxShadow: SHADOWS.card,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#128274;</div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: W.text, marginBottom: 4 }}>
            Widget Not Authorized
          </h2>
          <p style={{ fontSize: 13, color: W.textSecondary }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!auth) return null;

  const rate = Math.round(auth.commissionRate * 100);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Home", icon: "🏠" },
    { id: "calc", label: "Calc", icon: "🧮" },
    { id: "refer", label: "Refer", icon: "📤" },
    { id: "how", label: "Info", icon: "ℹ️" },
    { id: "help", label: "Help", icon: "❓" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* ─── Header ─── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0c1220, #060a14)",
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: RADII.sm,
              background: "linear-gradient(135deg, #c4a050, #f0d070)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#060a14",
              fontWeight: 800,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            F
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontSize: 13, fontWeight: 700, color: W.gold,
              fontFamily: "'DM Serif Display', Georgia, serif",
              letterSpacing: 0.3,
            }}>
              FinnPartnerOS
            </span>
            <span style={{ fontSize: 10, color: W.textDim, fontWeight: 500 }}>
              {auth.partnerName}
            </span>
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            background: "rgba(196,160,80,0.15)",
            color: "#c4a050",
            padding: "3px 10px",
            borderRadius: 9999,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {rate}% commission
        </span>
      </div>

      {/* ─── Tab bar ─── */}
      <div
        style={{
          display: "flex",
          background: "rgba(255,255,255,0.02)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "8px 0 6px",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: 0.5,
              textAlign: "center" as const,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
              color: tab === t.id ? "#c4a050" : "rgba(255,255,255,0.4)",
              borderBottom: tab === t.id ? "2px solid #c4a050" : "2px solid transparent",
            }}
          >
            <span style={{ fontSize: 16, display: "block", lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 9, marginTop: 2, display: "block" }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Content ─── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 36 }}>
        {tab === "dashboard" && (
          <WidgetDashboard token={auth.token} onReferClick={() => setTab("refer")} />
        )}
        {tab === "calc" && (
          <Suspense fallback={<GoldSpinner />}>
            <WidgetCalculator
              token={auth.token}
              commissionRate={rate}
              onSubmitAsReferral={handleCalcToReferral}
            />
          </Suspense>
        )}
        {tab === "refer" && (
          <WidgetReferralForm
            token={auth.token}
            commissionRate={rate}
            prefill={referralPrefill}
            onPrefillConsumed={() => setReferralPrefill(null)}
          />
        )}
        {tab === "how" && <WidgetHowItWorks commissionRate={rate} />}
        {tab === "help" && (
          <Suspense fallback={<GoldSpinner />}>
            <WidgetChat token={auth.token} />
          </Suspense>
        )}
      </div>

      {/* ─── Footer ─── */}
      <WidgetFooter />
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: W.bg }}>
          <GoldSpinner />
        </div>
      }
    >
      <WidgetContent />
    </Suspense>
  );
}
