"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense, lazy, type DragEvent } from "react";
import WidgetDashboard from "@/components/widget/WidgetDashboard";
import WidgetReferralForm from "@/components/widget/WidgetReferralForm";
import WidgetHowItWorks from "@/components/widget/WidgetHowItWorks";
import WidgetFooter from "@/components/widget/WidgetFooter";
import WidgetPopout from "@/components/widget/WidgetPopout";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

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

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          background: "linear-gradient(135deg, #0c1220, #060a14)",
          padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", borderRadius: RADII.md,
          border: `1px solid ${W.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/ai-avatars/stella.png" alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: W.gold }}>FinStellaTMS</span>
        </div>
        <span style={{ fontSize: 11, color: W.textDim }}>Tap to expand</span>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Home" },
    { id: "calc", label: "Calc" },
    { id: "refer", label: "Refer" },
    { id: "how", label: "Info" },
    { id: "help", label: "Help" },
  ];

  const tabIcons: Record<Tab, (c: string, active: boolean) => JSX.Element> = {
    dashboard: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? c : "none"} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13.999L12 4l8 9.999" fill="none"/><path d="M6 12.5V20a1 1 0 001 1h3.5v-5a1.5 1.5 0 013 0v5H17a1 1 0 001-1v-7.5" fill={a ? "rgba(196,160,80,0.15)" : "none"}/></svg>,
    calc: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2.5" fill={a ? "rgba(196,160,80,0.1)" : "none"}/><rect x="7" y="5" width="10" height="3" rx="1"/><circle cx="8.5" cy="12" r="0.8" fill={c}/><circle cx="12" cy="12" r="0.8" fill={c}/><circle cx="15.5" cy="12" r="0.8" fill={c}/><circle cx="8.5" cy="15.5" r="0.8" fill={c}/><circle cx="12" cy="15.5" r="0.8" fill={c}/><circle cx="15.5" cy="15.5" r="0.8" fill={c}/><circle cx="8.5" cy="19" r="0.8" fill={c}/><rect x="11" y="18.2" width="5.5" height="1.6" rx="0.8" fill={c}/></svg>,
    refer: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" strokeWidth="2"/><path d="M22 2L15 22l-4-9-9-4z" fill={a ? "rgba(196,160,80,0.12)" : "none"}/></svg>,
    how: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? "rgba(196,160,80,0.1)" : "none"} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4" strokeWidth="2.5"/><circle cx="12" cy="8" r="1" fill={c} stroke="none"/></svg>,
    help: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? "rgba(196,160,80,0.1)" : "none"} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="12" cy="10" r="0.8" fill={c} stroke="none"/><circle cx="8" cy="10" r="0.8" fill={c} stroke="none"/><circle cx="16" cy="10" r="0.8" fill={c} stroke="none"/></svg>,
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
      <div style={{
        background: "linear-gradient(135deg, #0c1220, #060a14)",
        padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/ai-avatars/stella.png"
            alt="Stella"
            style={{
              width: 34, height: 34, borderRadius: "50%",
              border: "2px solid rgba(196,160,80,0.4)",
              flexShrink: 0, objectFit: "cover",
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
            <span style={{
              fontSize: 9, color: W.gold, fontWeight: 600, marginTop: 2,
              background: "rgba(196,160,80,0.12)", padding: "2px 8px",
              borderRadius: 9999, alignSelf: "flex-start",
            }}>
              {rate}% commission
            </span>
          </div>
        </div>

        {/* Hamburger menu */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 6,
              display: "flex", flexDirection: "column", gap: 3,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 18, height: 2, borderRadius: 1,
                background: menuOpen ? W.gold : "rgba(255,255,255,0.5)",
                transition: "all 0.2s",
              }} />
            ))}
          </button>

          {menuOpen && (
            <div style={{
              position: "absolute", top: 36, right: 0, zIndex: 100,
              ...glassCardStyle(),
              boxShadow: SHADOWS.modal,
              padding: 4, minWidth: 150,
              display: "flex", flexDirection: "column",
            }}>
              {[
                { label: "Minimize", icon: "▬", action: () => { setMinimized(true); setMenuOpen(false); } },
                { label: "Pop Out", icon: "⧉", action: () => { window.open(window.location.href + (window.location.href.includes("?") ? "&" : "?") + "mode=popout", "_blank", "width=440,height=640"); setMenuOpen(false); } },
                { label: "Fintella Portal", icon: "→", action: () => { window.open("https://fintella.partners/dashboard", "_blank"); setMenuOpen(false); } },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "8px 12px", fontSize: 12, color: W.textSecondary,
                    display: "flex", alignItems: "center", gap: 8,
                    borderRadius: RADII.sm, textAlign: "left",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget).style.background = W.bgCardHover; (e.currentTarget).style.color = W.text; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; (e.currentTarget).style.color = W.textSecondary; }}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, margin: "0 auto",
              transition: "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
              transform: tab === t.id ? "scale(1.2)" : "scale(1)",
              filter: tab === t.id ? "drop-shadow(0 0 6px rgba(196,160,80,0.4))" : "none",
            }}>
              {tabIcons[t.id](tab === t.id ? "#c4a050" : "rgba(255,255,255,0.35)", tab === t.id)}
            </span>
            <span style={{ fontSize: 9, marginTop: 4, display: "block", letterSpacing: 0.8 }}>{t.label}</span>
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

function WidgetInner() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");

  const content = <WidgetContent />;

  if (mode === "popout") {
    return <WidgetPopout>{content}</WidgetPopout>;
  }

  return content;
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
      <WidgetInner />
    </Suspense>
  );
}
