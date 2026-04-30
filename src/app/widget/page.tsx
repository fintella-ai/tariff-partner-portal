"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense, lazy, type DragEvent } from "react";
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
  const [globalDragOver, setGlobalDragOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null);

  const handleGlobalDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setGlobalDragOver(true);
  }, []);

  const handleGlobalDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom) {
      setGlobalDragOver(false);
    }
  }, []);

  const handleGlobalDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGlobalDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ["application/pdf", "image/png", "image/jpeg"].includes(f.type)
    );
    if (files.length > 0) {
      setDroppedFiles(files);
      setTab("calc");
    }
  }, []);

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
    { id: "dashboard", label: "Home" },
    { id: "calc", label: "Calc" },
    { id: "refer", label: "Refer" },
    { id: "how", label: "Info" },
    { id: "help", label: "Help" },
  ];

  const tabIcons: Record<Tab, (c: string) => JSX.Element> = {
    dashboard: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    calc: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>,
    refer: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    how: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
    help: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100vh", position: "relative" }}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {/* ─── Global drop overlay ─── */}
      {globalDragOver && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          background: "rgba(6,10,20,0.85)", backdropFilter: "blur(8px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, border: "2px dashed rgba(196,160,80,0.5)", borderRadius: RADII.lg, margin: 8,
          pointerEvents: "none",
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c4a050" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: W.gold, fontFamily: "'DM Serif Display', Georgia, serif" }}>
            Drop documents to analyze
          </div>
          <div style={{ fontSize: 12, color: W.textDim }}>
            PDF, PNG, or JPG — we&apos;ll extract entries automatically
          </div>
        </div>
      )}

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
          <img
            src="/ai-avatars/stella.png"
            alt="Stella"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: "2px solid rgba(196,160,80,0.4)",
              flexShrink: 0,
              objectFit: "cover",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontSize: 13, fontWeight: 700, color: W.gold,
              fontFamily: "'DM Serif Display', Georgia, serif",
              letterSpacing: 0.3,
            }}>
              FinStellaTMS
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
            <span style={{
              display: "block", lineHeight: 1,
              transition: "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)",
              transform: tab === t.id ? "scale(1.15)" : "scale(1)",
            }}>
              {tabIcons[t.id](tab === t.id ? "#c4a050" : "rgba(255,255,255,0.4)")}
            </span>
            <span style={{ fontSize: 9, marginTop: 3, display: "block" }}>{t.label}</span>
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
              droppedFiles={droppedFiles}
              onDroppedFilesConsumed={() => setDroppedFiles(null)}
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
