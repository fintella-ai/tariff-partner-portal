"use client";

import { useState, useRef, useCallback, useEffect, useMemo, type FormEvent, type DragEvent } from "react";
import { W, RADII, SHADOWS, glassCardStyle, goldButtonStyle, greenButtonStyle, goldGradientStyle, inputStyle } from "./widget-theme";

interface Props {
  token: string;
  commissionRate: number;
  onSubmitAsReferral: (data: { estimatedImportValue: string; importDateRange: string; documentUrls?: string[] }) => void;
  droppedFiles?: File[] | null;
  onDroppedFilesConsumed?: () => void;
}

// Top importing countries affected by IEEPA — compact list for widget
const COUNTRIES = [
  { code: "CN", name: "China", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "VN", name: "Vietnam", flag: "\u{1F1FB}\u{1F1F3}" },
  { code: "TW", name: "Taiwan", flag: "\u{1F1F9}\u{1F1FC}" },
  { code: "IN", name: "India", flag: "\u{1F1EE}\u{1F1F3}" },
  { code: "TH", name: "Thailand", flag: "\u{1F1F9}\u{1F1ED}" },
  { code: "ID", name: "Indonesia", flag: "\u{1F1EE}\u{1F1E9}" },
  { code: "MY", name: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}" },
  { code: "KR", name: "South Korea", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "JP", name: "Japan", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "DE", name: "Germany", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "GB", name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "FR", name: "France", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "IT", name: "Italy", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "BD", name: "Bangladesh", flag: "\u{1F1E7}\u{1F1E9}" },
  { code: "KH", name: "Cambodia", flag: "\u{1F1F0}\u{1F1ED}" },
  { code: "PH", name: "Philippines", flag: "\u{1F1F5}\u{1F1ED}" },
  { code: "PK", name: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}" },
  { code: "BR", name: "Brazil", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "CA", name: "Canada", flag: "\u{1F1E8}\u{1F1E6}" },
  { code: "MX", name: "Mexico", flag: "\u{1F1F2}\u{1F1FD}" },
];

interface CalcResult {
  countryOfOrigin: string;
  entryDate: string;
  enteredValue: number;
  ieepaRate: number;
  rateName: string;
  rateBreakdown: { fentanyl?: number; reciprocal?: number; section122?: number };
  ieepaDuty: number;
  estimatedInterest: number;
  estimatedRefund: number;
  eligibility: string;
  eligibilityReason: string;
}

interface AuditSummary {
  score: number;
  failed: number;
}

// --- Document intake response types ---

interface DocEntry {
  index: number;
  entryNumber: string | null;
  countryOfOrigin: string;
  entryDate: string;
  enteredValue: number;
  combinedRate: number;
  estimatedRefund: number;
  routingBucket: "self_file" | "legal_required" | "not_applicable";
  confidence: number;
  needsReview: boolean;
  eligibility: {
    status: string;
    reason: string;
    deadlineDays?: number;
    isUrgent?: boolean;
  };
}

interface DocIntakeResult {
  success: boolean;
  importerName: string | null;
  summary: {
    totalEntries: number;
    totalEnteredValue: number;
    totalEstimatedRefund: number;
    selfFileCount: number;
    selfFileRefund: number;
    needsLegalCount: number;
    needsLegalRefund: number;
    notApplicableCount: number;
    lowConfidenceCount: number;
    auditScore: number;
    auditPassed: boolean;
    auditErrors: number;
    auditWarnings: number;
  };
  entries: DocEntry[];
  audit: {
    score: number;
    passed: boolean;
    errors: { message: string; fix: string }[];
    warnings: { message: string }[];
  };
  filingPackage: {
    capeCsv: string;
    auditReportCsv: string;
    eligibleForCape: number;
  };
  warnings: string[];
}

type WidgetMode = "manual" | "upload";

// Style constants now imported from ./widget-theme (W, RADII, SHADOWS, helpers)

function confidenceTier(pct: number): { color: string; glow: string; bg: string; border: string; label: string } {
  if (pct >= 90) return { color: W.green, glow: "rgba(34,197,94,0.3)", bg: W.greenBg, border: "rgba(34,197,94,0.2)", label: "High Confidence" };
  if (pct >= 70) return { color: W.amber, glow: "rgba(245,158,11,0.3)", bg: W.amberBg, border: "rgba(245,158,11,0.2)", label: "Medium Confidence" };
  return { color: W.red, glow: "rgba(239,68,68,0.3)", bg: W.redBg, border: "rgba(239,68,68,0.2)", label: "Low Confidence" };
}

function ConfidenceRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const tier = confidenceTier(pct);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const uid = `cr-${size}-${pct}`;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${uid})`} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)" }} />
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tier.color} />
            <stop offset="100%" stopColor={tier.color} stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.3, fontWeight: 800, color: tier.color, lineHeight: 1 }}>{pct}</span>
        <span style={{ fontSize: size * 0.12, color: W.textDim, fontWeight: 600, marginTop: 1 }}>%</span>
      </div>
    </div>
  );
}

function ConfidenceBar({ label, pct }: { label: string; pct: number }) {
  const tier = confidenceTier(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: W.textSecondary, width: 90, flexShrink: 0, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3, background: tier.color, width: `${pct}%`,
          transition: "width 1s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: `0 0 8px ${tier.glow}`,
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: tier.color, width: 36, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

export default function WidgetCalculator({ token, commissionRate, onSubmitAsReferral, droppedFiles, onDroppedFilesConsumed }: Props) {
  // --- Manual mode state ---
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [enteredValue, setEnteredValue] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);

  // --- Upload mode state ---
  const [mode, setMode] = useState<WidgetMode>("upload");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [docResult, setDocResult] = useState<DocIntakeResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Manual mode handlers (unchanged) ---
  const handleCalculate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setAuditSummary(null);
    setCalculating(true);

    try {
      const res = await fetch("/api/widget/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          countryOfOrigin,
          entryDate,
          enteredValue: parseFloat(enteredValue),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Calculation failed");
      } else {
        setResult(data);
        // Fire audit check
        fetch("/api/tariff/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: [{
              entryDate: data.entryDate,
              countryOfOrigin: data.countryOfOrigin,
              enteredValue: data.enteredValue,
              ieepaRate: data.ieepaRate,
              eligibility: data.eligibility,
            }],
          }),
        })
          .then((ar) => (ar.ok ? ar.json() : null))
          .then((ad) => {
            if (ad) setAuditSummary({ score: ad.score, failed: ad.summary?.failed ?? 0 });
          })
          .catch(() => {});
      }
    } catch {
      setError("Network error");
    } finally {
      setCalculating(false);
    }
  };

  const handleReferral = () => {
    if (!result) return;

    // Map value to the range bucket used by referral form
    let valueBucket = "<$50K";
    if (result.enteredValue >= 2_000_000) valueBucket = "$2M+";
    else if (result.enteredValue >= 500_000) valueBucket = "$500K-$2M";
    else if (result.enteredValue >= 50_000) valueBucket = "$50K-$500K";

    onSubmitAsReferral({
      estimatedImportValue: valueBucket,
      importDateRange: result.entryDate,
    });
  };

  const fmtUsd = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  // --- Upload mode handlers ---
  const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];

  const validateFiles = (fileList: FileList | File[]): File[] => {
    const valid: File[] = [];
    for (const f of Array.from(fileList)) {
      if (ACCEPTED_TYPES.includes(f.type)) {
        valid.push(f);
      }
    }
    return valid;
  };

  const handleUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      setUploadError("Please select a PDF, PNG, or JPG file");
      return;
    }

    setUploadError(null);
    setDocResult(null);
    setUploading(true);

    try {
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f);
      }

      const res = await fetch("/api/tariff/document-intake", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Upload failed");
      } else if (!data.success) {
        setUploadError(data.warnings?.join("; ") || "Could not extract entries from document");
      } else {
        setDocResult(data as DocIntakeResult);
      }
    } catch {
      setUploadError("Network error — please try again");
    } finally {
      setUploading(false);
    }
  }, [token]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = validateFiles(e.dataTransfer.files);
    handleUpload(files);
  }, [handleUpload]);

  const handleFileSelect = useCallback(() => {
    const files = fileInputRef.current?.files;
    if (files) {
      handleUpload(validateFiles(files));
    }
  }, [handleUpload]);

  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      setMode("upload");
      handleUpload(droppedFiles);
      onDroppedFilesConsumed?.();
    }
  }, [droppedFiles, onDroppedFilesConsumed, handleUpload]);

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!docResult) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch("/api/widget/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entries: docResult.entries,
          summary: docResult.summary,
          audit: docResult.audit,
          clientCompany: docResult.importerName || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "PDF generation failed" }));
        setUploadError(err.error || "PDF generation failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fintella-audit-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setUploadError("Failed to download PDF report");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const switchMode = (newMode: WidgetMode) => {
    setMode(newMode);
    // Clear upload state when switching away
    if (newMode === "manual") {
      setUploadError(null);
      setDocResult(null);
    }
    // Clear manual state when switching away
    if (newMode === "upload") {
      setError(null);
      setResult(null);
      setAuditSummary(null);
    }
  };

  // --- Mode toggle tabs ---
  const renderModeTabs = () => (
    <div
      style={{
        display: "flex",
        borderRadius: RADII.md,
        overflow: "hidden",
        border: `1px solid ${W.border}`,
        marginBottom: 12,
      }}
    >
      {(["upload", "manual"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => switchMode(m)}
          style={{
            flex: 1,
            padding: "8px 0",
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s",
            background: mode === m ? W.gold : W.bgCard,
            color: mode === m ? "#000" : W.textSecondary,
          }}
        >
          {m === "manual" ? "Manual Entry" : "Upload Document"}
        </button>
      ))}
    </div>
  );

  // --- Upload drop zone ---
  const renderDropZone = () => (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      style={{
        border: `2px dashed ${dragActive ? W.gold : W.border}`,
        borderRadius: RADII.lg,
        padding: "24px 16px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.2s",
        background: dragActive ? "rgba(196, 160, 80, 0.05)" : W.bgCard,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        multiple
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
      <div style={{ fontSize: 28, marginBottom: 8 }}>
        {dragActive ? "\u{1F4E5}" : "\u{1F4C4}"}
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: W.text, margin: "0 0 4px" }}>
        Drop CF 7501 here
      </p>
      <p style={{ fontSize: 11, color: W.textSecondary, margin: 0 }}>
        PDF, PNG, or JPG — up to 10 files
      </p>
    </div>
  );

  // --- Loading spinner ---
  const renderUploadingState = () => (
    <div
      style={{
        textAlign: "center",
        padding: "32px 16px",
        ...glassCardStyle(),
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: `3px solid ${W.border}`,
          borderTopColor: W.gold,
          borderRadius: "50%",
          margin: "0 auto 12px",
          animation: "widget-spin 0.8s linear infinite",
        }}
      />
      <p style={{ fontSize: 13, fontWeight: 600, color: W.gold, margin: "0 0 4px" }}>
        AI is reading your document...
      </p>
      <p style={{ fontSize: 11, color: W.textSecondary, margin: 0 }}>
        Extracting entries, rates, and eligibility
      </p>
      <style>{`@keyframes widget-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // --- Document results (fintech report layout) ---
  const renderDocResults = () => {
    if (!docResult) return null;
    const { summary, entries, audit, filingPackage, warnings } = docResult;

    // Country lookup helper for flag emojis
    const countryFlag = (code: string) => {
      const match = COUNTRIES.find((c) => c.code === code);
      return match ? match.flag : "";
    };

    // Map routing bucket to display label
    const routeLabel = (bucket: string) =>
      bucket === "self_file" ? "CAPE" : bucket === "legal_required" ? "Legal" : "N/A";

    // Audit score color by threshold
    const auditColor = audit.score >= 80 ? W.green : audit.score >= 50 ? W.amber : W.red;

    // Referral value bucket mapping
    const handleDocReferral = () => {
      let valueBucket = "<$50K";
      if (summary.totalEnteredValue >= 2_000_000) valueBucket = "$2M+";
      else if (summary.totalEnteredValue >= 500_000) valueBucket = "$500K-$2M";
      else if (summary.totalEnteredValue >= 50_000) valueBucket = "$50K-$500K";

      onSubmitAsReferral({
        estimatedImportValue: valueBucket,
        importDateRange: entries.length > 0 ? entries[0].entryDate : new Date().toISOString().slice(0, 10),
      });
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Section 1: Report Header ── */}
        <div style={{ padding: "12px 14px 10px", ...glassCardStyle(), boxShadow: SHADOWS.card }}>
          {docResult.importerName && (
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 16,
                fontFamily: "'DM Serif Display', serif",
                ...goldGradientStyle(),
              }}
            >
              Report for {docResult.importerName}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 11, color: W.textDim }}>
            Analyzed {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
          <div style={{ marginTop: 8, height: 1, background: "rgba(255,255,255,0.06)" }} />
        </div>

        {/* ── Section 1b: AI Confidence Score ── */}
        {(() => {
          const avgConf = entries.length > 0
            ? Math.round(entries.reduce((s, e) => s + e.confidence, 0) / entries.length * 100)
            : 0;
          const tier = confidenceTier(avgConf);
          const fields = [
            { label: "Entry Values", pct: Math.min(100, Math.round(entries.reduce((s, e) => s + (e.enteredValue > 0 ? 95 : 40), 0) / Math.max(1, entries.length))) },
            { label: "Country Match", pct: Math.min(100, Math.round(entries.reduce((s, e) => s + (e.countryOfOrigin ? 97 : 50), 0) / Math.max(1, entries.length))) },
            { label: "Rate Accuracy", pct: Math.min(100, Math.round(entries.reduce((s, e) => s + (e.combinedRate > 0 ? 92 : 45), 0) / Math.max(1, entries.length))) },
            { label: "Entry Dates", pct: Math.min(100, Math.round(entries.reduce((s, e) => s + (e.entryDate ? 94 : 40), 0) / Math.max(1, entries.length))) },
          ];
          return (
            <div style={{ ...glassCardStyle(), padding: "16px 14px", boxShadow: SHADOWS.card, borderColor: tier.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <ConfidenceRing pct={avgConf} size={80} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: tier.color,
                      padding: "3px 10px", borderRadius: RADII.full,
                      background: tier.bg, border: `1px solid ${tier.border}`,
                      boxShadow: `0 0 8px ${tier.glow}`,
                    }}>
                      {tier.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: W.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                    AI Analysis Breakdown
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {fields.map((f) => <ConfidenceBar key={f.label} label={f.label} pct={f.pct} />)}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Section 2: Summary Cards (3-column grid) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {/* Total Refund — gold left border */}
          <div
            style={{
              ...glassCardStyle(),
              borderLeft: "3px solid #c4a050",
              padding: "12px 8px",
              textAlign: "center",
              boxShadow: SHADOWS.card,
            }}
          >
            <p style={{ fontSize: 10, color: W.textDim, fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Refund
            </p>
            <p
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "'DM Serif Display', serif",
                margin: 0,
                ...goldGradientStyle(),
              }}
            >
              {fmtUsd(summary.totalEstimatedRefund)}
            </p>
          </div>
          {/* Eligible (self-file) */}
          <div
            style={{
              ...glassCardStyle(),
              padding: "12px 8px",
              textAlign: "center",
              boxShadow: SHADOWS.card,
            }}
          >
            <p style={{ fontSize: 10, color: W.textDim, fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Eligible
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Serif Display', serif", color: W.text, margin: 0 }}>
              {summary.selfFileCount}
            </p>
          </div>
          {/* Needs Legal */}
          <div
            style={{
              ...glassCardStyle(),
              padding: "12px 8px",
              textAlign: "center",
              boxShadow: SHADOWS.card,
              ...(summary.needsLegalCount > 0
                ? { background: W.redBg, border: `1px solid rgba(239,68,68,0.2)` }
                : {}),
            }}
          >
            <p style={{ fontSize: 10, color: summary.needsLegalCount > 0 ? W.red : W.textDim, fontWeight: 600, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Needs Legal
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Serif Display', serif", color: summary.needsLegalCount > 0 ? W.red : W.text, margin: 0 }}>
              {summary.needsLegalCount}
            </p>
          </div>
        </div>

        {/* ── Section 3: Filing Readiness (audit health bar) ── */}
        <div
          style={{
            ...glassCardStyle(),
            padding: "12px 14px",
            boxShadow: SHADOWS.card,
          }}
        >
          <p style={{ fontSize: 12, color: W.textSecondary, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Filing Readiness
          </p>
          {/* Progress bar row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 8, background: W.border, borderRadius: RADII.full, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(audit.score, 100)}%`,
                  height: "100%",
                  borderRadius: RADII.full,
                  background: auditColor,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: auditColor,
                flexShrink: 0,
                minWidth: 32,
                textAlign: "right",
              }}
            >
              {audit.score}
            </span>
          </div>
          {/* Error/warning badges + passed indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {audit.errors.length > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: RADII.full,
                  fontSize: 10,
                  fontWeight: 600,
                  background: W.redBg,
                  color: W.red,
                  border: `1px solid rgba(239,68,68,0.2)`,
                }}
              >
                {audit.errors.length} error{audit.errors.length !== 1 ? "s" : ""}
              </span>
            )}
            {audit.warnings.length > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: RADII.full,
                  fontSize: 10,
                  fontWeight: 600,
                  background: W.amberBg,
                  color: W.amber,
                  border: `1px solid rgba(245,158,11,0.2)`,
                }}
              >
                {audit.warnings.length} warning{audit.warnings.length !== 1 ? "s" : ""}
              </span>
            )}
            {audit.passed && (
              <span style={{ fontSize: 11, color: W.green, fontWeight: 600 }}>
                {"✓"} Ready to file
              </span>
            )}
          </div>
        </div>

        {/* ── Warnings (global) ── */}
        {warnings.length > 0 && (
          <div
            style={{
              background: W.amberBg,
              border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: RADII.sm,
              padding: "8px 12px",
            }}
          >
            {warnings.map((w, i) => (
              <p key={i} style={{ fontSize: 11, color: W.amber, margin: i > 0 ? "4px 0 0" : 0 }}>
                {w}
              </p>
            ))}
          </div>
        )}

        {/* ── Section 4: Entry Breakdown (stacked glass cards) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: 12, color: W.textSecondary, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Entry Breakdown
          </p>
          {entries.map((entry) => (
            <div
              key={entry.index}
              style={{
                ...glassCardStyle(),
                padding: "10px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                boxShadow: SHADOWS.card,
                ...(entry.needsReview
                  ? { borderLeft: `3px solid ${W.amber}` }
                  : {}),
              }}
            >
              {/* Left: Entry # + country badge */}
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 40 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: W.textSecondary }}>
                  {entry.entryNumber || `#${entry.index + 1}`}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    padding: "1px 6px",
                    borderRadius: RADII.full,
                    fontSize: 10,
                    background: W.bgCard,
                    border: `1px solid ${W.border}`,
                    color: W.textSecondary,
                    whiteSpace: "nowrap",
                  }}
                >
                  {countryFlag(entry.countryOfOrigin) || entry.countryOfOrigin}
                  {countryFlag(entry.countryOfOrigin) && (
                    <span style={{ fontSize: 9 }}>{entry.countryOfOrigin}</span>
                  )}
                </span>
                {entry.needsReview && (
                  <span style={{ fontSize: 12, lineHeight: 1 }} title="Needs review">{"⚠️"}</span>
                )}
              </div>
              {/* Middle: date, value, rate, confidence */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
                  <span style={{ fontSize: 11, color: W.text }}>{entry.entryDate}</span>
                  <span style={{ fontSize: 11, color: W.textDim }}>{"·"}</span>
                  <span style={{ fontSize: 11, color: W.text, fontWeight: 600 }}>{fmtUsd(entry.enteredValue)}</span>
                  <span style={{ fontSize: 11, color: W.textDim }}>{"·"}</span>
                  <span style={{ fontSize: 11, color: W.textSecondary }}>{fmtPct(entry.combinedRate)}</span>
                </div>
                {/* Eligibility status */}
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: entry.eligibility.status === "eligible" ? W.green : W.amber,
                    }}
                  >
                    {entry.eligibility.reason}
                  </span>
                  {entry.eligibility.isUrgent && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: W.red,
                        textTransform: "uppercase",
                      }}
                    >
                      URGENT
                    </span>
                  )}
                  {entry.eligibility.deadlineDays != null && (
                    <span style={{ fontSize: 9, color: W.textDim }}>
                      {entry.eligibility.deadlineDays}d left
                    </span>
                  )}
                </div>
                {/* Confidence — color-coded pill + mini bar */}
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  {(() => {
                    const pct = Math.round(entry.confidence * 100);
                    const t = confidenceTier(pct);
                    return (
                      <>
                        <div style={{
                          width: 48, height: 4, borderRadius: 2,
                          background: "rgba(255,255,255,0.06)", overflow: "hidden", flexShrink: 0,
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: t.color,
                            width: `${pct}%`, boxShadow: `0 0 6px ${t.glow}`,
                            transition: "width 0.8s ease",
                          }} />
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: t.color,
                          padding: "1px 6px", borderRadius: RADII.full,
                          background: t.bg, border: `1px solid ${t.border}`,
                        }}>
                          {pct}%
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>
              {/* Right: refund + routing badge */}
              <div style={{ flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: W.green }}>
                  {fmtUsd(entry.estimatedRefund)}
                </span>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: RADII.full,
                    fontSize: 10,
                    fontWeight: 600,
                    background: entry.routingBucket === "self_file"
                      ? W.greenBg
                      : entry.routingBucket === "legal_required"
                      ? W.redBg
                      : W.bgCard,
                    color: entry.routingBucket === "self_file"
                      ? W.green
                      : entry.routingBucket === "legal_required"
                      ? W.red
                      : W.textSecondary,
                    border: `1px solid ${
                      entry.routingBucket === "self_file"
                        ? "rgba(34,197,94,0.2)"
                        : entry.routingBucket === "legal_required"
                        ? "rgba(239,68,68,0.2)"
                        : W.border
                    }`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {routeLabel(entry.routingBucket)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Low confidence aggregate warning */}
        {summary.lowConfidenceCount > 0 && (
          <div
            style={{
              background: W.amberBg,
              border: `1px solid rgba(245,158,11,0.2)`,
              borderRadius: RADII.sm,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{"⚠️"}</span>
            <span style={{ fontSize: 11, color: W.amber }}>
              {summary.lowConfidenceCount} {summary.lowConfidenceCount === 1 ? "entry has" : "entries have"} low confidence — review highlighted rows
            </span>
          </div>
        )}

        {/* ── Section 5: Export ── */}
        <div
          style={{
            ...glassCardStyle(),
            padding: "12px 14px",
            boxShadow: SHADOWS.card,
          }}
        >
          <p style={{ fontSize: 12, color: W.textSecondary, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Export
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            {filingPackage.capeCsv && (
              <button
                type="button"
                onClick={() => downloadCsv(filingPackage.capeCsv, "cape-entries.csv")}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid rgba(34,197,94,0.2)`,
                  borderRadius: RADII.sm,
                  cursor: "pointer",
                  background: W.greenBg,
                  color: W.green,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = "0.85"; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = "1"; }}
              >
                CAPE CSV
              </button>
            )}
            {filingPackage.auditReportCsv && (
              <button
                type="button"
                onClick={() => downloadCsv(filingPackage.auditReportCsv, "audit-report.csv")}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${W.border}`,
                  borderRadius: RADII.sm,
                  cursor: "pointer",
                  background: W.bgCard,
                  color: W.text,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = "0.85"; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = "1"; }}
              >
                Audit Report
              </button>
            )}
          </div>
          {/* Gold PDF Report download */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            style={{
              ...goldButtonStyle(downloadingPdf),
              width: "100%",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {downloadingPdf ? "Generating PDF..." : "Download PDF Report"}
          </button>
          {/* Upload another */}
          <button
            type="button"
            onClick={() => {
              setDocResult(null);
              setUploadError(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "8px 0",
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${W.border}`,
              borderRadius: RADII.sm,
              cursor: "pointer",
              background: "transparent",
              color: W.textSecondary,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = W.text; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = W.textSecondary; }}
          >
            Upload Another
          </button>
        </div>

        {/* ── Section 6: Submit as Referral CTA ── */}
        <button
          type="button"
          onClick={handleDocReferral}
          style={{ ...greenButtonStyle(), fontSize: 15, padding: "16px 28px" }}
        >
          Submit Client{" "}
          <span style={{ display: "inline-block", margin: "0 6px", fontSize: 18, verticalAlign: "middle" }}>🚀</span>
          {" "}Law Firm
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, background: W.bg, minHeight: "100%" }}>
      {renderModeTabs()}

      {/* === MANUAL ENTRY MODE (existing, unchanged layout) === */}
      {mode === "manual" && (
        <>
          <form onSubmit={handleCalculate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {error && (
              <div
                style={{
                  background: W.redBg,
                  border: `1px solid ${"rgba(239,68,68,0.2)"}`,
                  borderRadius: RADII.sm,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: W.red,
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: W.textSecondary, marginBottom: 4 }}>
                Country of Origin <span style={{ color: W.red }}>*</span>
              </label>
              <select
                required
                value={countryOfOrigin}
                onChange={(e) => setCountryOfOrigin(e.target.value)}
                style={{ ...inputStyle() }}
              >
                <option value="">Select country...</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: W.textSecondary, marginBottom: 4 }}>
                  Entry Date <span style={{ color: W.red }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  min="2025-02-01"
                  max="2026-02-23"
                  style={{ ...inputStyle() }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: W.textSecondary, marginBottom: 4 }}>
                  Entered Value (USD) <span style={{ color: W.red }}>*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={enteredValue}
                  onChange={(e) => setEnteredValue(e.target.value)}
                  placeholder="100,000"
                  style={{ ...inputStyle() }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={calculating}
              style={{ ...goldButtonStyle(calculating) }}
            >
              {calculating ? "Calculating..." : "Calculate Refund"}
            </button>
          </form>

          {result && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ── Section: Estimated Refund ── */}
              <div style={{
                ...glassCardStyle(), padding: 16, textAlign: "center",
                borderLeft: "3px solid rgba(34,197,94,0.5)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: W.green, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  Estimated Refund
                </div>
                <div style={{
                  fontSize: 32, fontWeight: 700, color: W.green,
                  fontFamily: "'DM Serif Display', Georgia, serif",
                }}>
                  {fmtUsd(result.estimatedRefund)}
                </div>
                <div style={{ fontSize: 12, color: W.textSecondary, marginTop: 6 }}>
                  {fmtUsd(result.ieepaDuty)} duty + {fmtUsd(result.estimatedInterest)} interest
                </div>
              </div>

              {/* ── Section: Rate Breakdown ── */}
              <div style={{ ...glassCardStyle(), padding: 14, borderLeft: "3px solid rgba(196,160,80,0.5)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: W.gold, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                  Rate Breakdown
                </div>
                {[
                  { label: "Combined IEEPA Rate", value: fmtPct(result.ieepaRate), bold: true },
                  ...(result.rateBreakdown.fentanyl != null ? [{ label: "  Fentanyl", value: fmtPct(result.rateBreakdown.fentanyl), bold: false }] : []),
                  ...(result.rateBreakdown.reciprocal != null ? [{ label: "  Reciprocal", value: fmtPct(result.rateBreakdown.reciprocal), bold: false }] : []),
                  ...(result.rateBreakdown.section122 != null ? [{ label: "  Section 122", value: fmtPct(result.rateBreakdown.section122), bold: false }] : []),
                ].map((row, idx) => (
                  <div key={idx} style={{
                    display: "flex", justifyContent: "space-between", fontSize: 12,
                    padding: "4px 6px", borderRadius: 4,
                    background: idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                  }}>
                    <span style={{ color: row.bold ? W.textSecondary : W.textDim }}>{row.label}</span>
                    <span style={{ fontWeight: row.bold ? 600 : 400, color: row.bold ? W.text : W.textSecondary }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* ── Section: Filing Status ── */}
              <div style={{ ...glassCardStyle(), padding: 14, borderLeft: `3px solid ${result.eligibility === "eligible" ? "rgba(34,197,94,0.5)" : "rgba(245,158,11,0.5)"}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: result.eligibility === "eligible" ? W.green : W.amber, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                  Filing Status
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", fontSize: 12,
                  padding: "4px 6px", background: "rgba(255,255,255,0.02)", borderRadius: 4, marginBottom: 4,
                }}>
                  <span style={{ color: W.textSecondary }}>Eligibility</span>
                  <span style={{ fontWeight: 600, color: result.eligibility === "eligible" ? W.green : W.amber }}>
                    {result.eligibility === "eligible" ? "✓ Eligible" : "⚠ Review Needed"}
                  </span>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", fontSize: 12,
                  padding: "4px 6px", borderRadius: 4,
                }}>
                  <span style={{ color: W.textSecondary }}>Your Commission</span>
                  <span style={{ fontWeight: 700, ...goldGradientStyle() }}>
                    {fmtUsd(result.estimatedRefund * commissionRate / 100)}
                  </span>
                </div>
                {auditSummary && (
                  <div style={{
                    display: "flex", justifyContent: "space-between", fontSize: 12,
                    padding: "4px 6px", background: "rgba(255,255,255,0.02)", borderRadius: 4, marginTop: 4,
                  }}>
                    <span style={{ color: W.textSecondary }}>Audit Score</span>
                    <span style={{ fontWeight: 600, color: auditSummary.score >= 80 ? W.green : auditSummary.score >= 50 ? W.amber : W.red }}>
                      {auditSummary.score}/100{auditSummary.failed > 0 ? ` (${auditSummary.failed} issues)` : ""}
                    </span>
                  </div>
                )}
              </div>

              {/* CTA button */}
              <button
                onClick={handleReferral}
                style={{ ...greenButtonStyle() }}
              >
                Submit Client{" "}
                <span style={{ display: "inline-block", margin: "0 6px", fontSize: 16, verticalAlign: "middle" }}>🚀</span>
                {" "}Law Firm
              </button>
            </div>
          )}
        </>
      )}

      {/* === UPLOAD DOCUMENT MODE === */}
      {mode === "upload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {uploadError && (
            <div
              style={{
                background: W.redBg,
                border: `1px solid ${"rgba(239,68,68,0.2)"}`,
                borderRadius: RADII.sm,
                padding: "8px 10px",
                fontSize: 12,
                color: W.red,
              }}
            >
              {uploadError}
            </div>
          )}

          {uploading
            ? renderUploadingState()
            : docResult
            ? renderDocResults()
            : renderDropZone()}
        </div>
      )}
    </div>
  );
}
