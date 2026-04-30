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

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "calc", label: "Calculator" },
    { id: "refer", label: "Refer" },
    { id: "how", label: "Info" },
    { id: "help", label: "Help" },
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
          {/* Gold circle avatar */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #c4a050, #f0d070)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#060a14",
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {auth.partnerName.charAt(0).toUpperCase()}
          </div>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "rgba(255,255,255,0.95)",
              fontFamily: "'DM Serif Display', Georgia, serif",
            }}
          >
            {auth.partnerName}
          </span>
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
              padding: "10px 0",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
              color: tab === t.id ? "#c4a050" : "rgba(255,255,255,0.4)",
              borderBottom: tab === t.id ? "2px solid #c4a050" : "2px solid transparent",
            }}
          >
            {t.label}
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
