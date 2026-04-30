"use client";

import { useState, useRef, useCallback, type FormEvent, type DragEvent } from "react";

interface Props {
  token: string;
  commissionRate: number;
  onSubmitAsReferral: (data: { estimatedImportValue: string; importDateRange: string }) => void;
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

// --- Inline style constants (dark theme for embedded widget) ---
const COLORS = {
  bg: "#0a0a0a",
  bgCard: "#141414",
  bgHover: "#1a1a1a",
  border: "#2a2a2a",
  text: "#e5e5e5",
  textMuted: "#999",
  textDim: "#666",
  gold: "#c4a050",
  goldDim: "#a08030",
  green: "#16a34a",
  greenBg: "#052e16",
  greenBorder: "#14532d",
  red: "#dc2626",
  redBg: "#2a0a0a",
  redBorder: "#7f1d1d",
  yellow: "#eab308",
  yellowBg: "#2a2400",
  yellowBorder: "#713f12",
} as const;

export default function WidgetCalculator({ token, commissionRate, onSubmitAsReferral }: Props) {
  // --- Manual mode state ---
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [enteredValue, setEnteredValue] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);

  // --- Upload mode state ---
  const [mode, setMode] = useState<WidgetMode>("manual");
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

  const downloadCsv = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${COLORS.border}`,
        marginBottom: 12,
      }}
    >
      {(["manual", "upload"] as const).map((m) => (
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
            background: mode === m ? COLORS.gold : COLORS.bgCard,
            color: mode === m ? "#000" : COLORS.textMuted,
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
        border: `2px dashed ${dragActive ? COLORS.gold : COLORS.border}`,
        borderRadius: 8,
        padding: "24px 16px",
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.2s",
        background: dragActive ? "rgba(196, 160, 80, 0.05)" : COLORS.bgCard,
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
      <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, margin: "0 0 4px" }}>
        Drop CF 7501 here
      </p>
      <p style={{ fontSize: 11, color: COLORS.textMuted, margin: 0 }}>
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
        background: COLORS.bgCard,
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: `3px solid ${COLORS.border}`,
          borderTopColor: COLORS.gold,
          borderRadius: "50%",
          margin: "0 auto 12px",
          animation: "widget-spin 0.8s linear infinite",
        }}
      />
      <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.gold, margin: "0 0 4px" }}>
        AI is reading your document...
      </p>
      <p style={{ fontSize: 11, color: COLORS.textMuted, margin: 0 }}>
        Extracting entries, rates, and eligibility
      </p>
      <style>{`@keyframes widget-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // --- Document results ---
  const renderDocResults = () => {
    if (!docResult) return null;
    const { summary, entries, audit, filingPackage, warnings } = docResult;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {/* Total refund */}
          <div
            style={{
              background: COLORS.greenBg,
              border: `1px solid ${COLORS.greenBorder}`,
              borderRadius: 8,
              padding: "10px 8px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 10, color: COLORS.green, fontWeight: 600, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Total Refund
            </p>
            <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, margin: 0 }}>
              {fmtUsd(summary.totalEstimatedRefund)}
            </p>
          </div>
          {/* Self-file */}
          <div
            style={{
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "10px 8px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Eligible
            </p>
            <p style={{ fontSize: 16, fontWeight: 700, color: COLORS.text, margin: 0 }}>
              {summary.selfFileCount}
            </p>
          </div>
          {/* Needs legal */}
          <div
            style={{
              background: summary.needsLegalCount > 0 ? COLORS.redBg : COLORS.bgCard,
              border: `1px solid ${summary.needsLegalCount > 0 ? COLORS.redBorder : COLORS.border}`,
              borderRadius: 8,
              padding: "10px 8px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 10, color: summary.needsLegalCount > 0 ? COLORS.red : COLORS.textMuted, fontWeight: 600, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Needs Legal
            </p>
            <p style={{ fontSize: 16, fontWeight: 700, color: summary.needsLegalCount > 0 ? COLORS.red : COLORS.text, margin: 0 }}>
              {summary.needsLegalCount}
            </p>
          </div>
        </div>

        {/* Audit score bar */}
        <div
          style={{
            background: COLORS.bgCard,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 11, color: COLORS.textMuted, flexShrink: 0 }}>Audit</span>
          <div style={{ flex: 1, height: 6, background: COLORS.border, borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(audit.score, 100)}%`,
                height: "100%",
                borderRadius: 3,
                background: audit.score >= 80 ? COLORS.green : audit.score >= 50 ? COLORS.yellow : COLORS.red,
                transition: "width 0.5s",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: audit.score >= 80 ? COLORS.green : audit.score >= 50 ? COLORS.yellow : COLORS.red,
              flexShrink: 0,
              minWidth: 32,
              textAlign: "right",
            }}
          >
            {audit.score}
          </span>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div
            style={{
              background: COLORS.yellowBg,
              border: `1px solid ${COLORS.yellowBorder}`,
              borderRadius: 6,
              padding: "6px 10px",
            }}
          >
            {warnings.map((w, i) => (
              <p key={i} style={{ fontSize: 11, color: COLORS.yellow, margin: i > 0 ? "2px 0 0" : 0 }}>
                {w}
              </p>
            ))}
          </div>
        )}

        {/* Entries table */}
        <div
          style={{
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
                minWidth: 480,
              }}
            >
              <thead>
                <tr style={{ background: COLORS.bgCard }}>
                  {["Entry #", "Country", "Date", "Value", "Rate", "Refund", "Route", "Conf."].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 6px",
                        textAlign: "left",
                        fontWeight: 600,
                        color: COLORS.textMuted,
                        borderBottom: `1px solid ${COLORS.border}`,
                        whiteSpace: "nowrap",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.index}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`,
                      background: entry.needsReview ? COLORS.yellowBg : "transparent",
                    }}
                  >
                    <td style={{ padding: "6px", color: COLORS.text, whiteSpace: "nowrap" }}>
                      {entry.entryNumber || `#${entry.index + 1}`}
                    </td>
                    <td style={{ padding: "6px", color: COLORS.text }}>
                      {entry.countryOfOrigin}
                    </td>
                    <td style={{ padding: "6px", color: COLORS.text, whiteSpace: "nowrap" }}>
                      {entry.entryDate}
                    </td>
                    <td style={{ padding: "6px", color: COLORS.text, whiteSpace: "nowrap" }}>
                      {fmtUsd(entry.enteredValue)}
                    </td>
                    <td style={{ padding: "6px", color: COLORS.text }}>
                      {fmtPct(entry.combinedRate)}
                    </td>
                    <td style={{ padding: "6px", color: COLORS.green, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {fmtUsd(entry.estimatedRefund)}
                    </td>
                    <td style={{ padding: "6px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                          background: entry.routingBucket === "self_file"
                            ? COLORS.greenBg
                            : entry.routingBucket === "legal_required"
                            ? COLORS.redBg
                            : COLORS.bgCard,
                          color: entry.routingBucket === "self_file"
                            ? COLORS.green
                            : entry.routingBucket === "legal_required"
                            ? COLORS.red
                            : COLORS.textMuted,
                          border: `1px solid ${
                            entry.routingBucket === "self_file"
                              ? COLORS.greenBorder
                              : entry.routingBucket === "legal_required"
                              ? COLORS.redBorder
                              : COLORS.border
                          }`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.routingBucket === "self_file"
                          ? "CAPE"
                          : entry.routingBucket === "legal_required"
                          ? "Legal"
                          : "N/A"}
                      </span>
                    </td>
                    <td style={{ padding: "6px" }}>
                      {entry.needsReview ? (
                        <span
                          style={{
                            color: COLORS.yellow,
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                          title={`Confidence: ${Math.round(entry.confidence * 100)}% — review recommended`}
                        >
                          {Math.round(entry.confidence * 100)}%
                        </span>
                      ) : (
                        <span style={{ color: COLORS.textDim, fontSize: 10 }}>
                          {Math.round(entry.confidence * 100)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low confidence warning */}
        {summary.lowConfidenceCount > 0 && (
          <div
            style={{
              background: COLORS.yellowBg,
              border: `1px solid ${COLORS.yellowBorder}`,
              borderRadius: 6,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>{"⚠️"}</span>
            <span style={{ fontSize: 11, color: COLORS.yellow }}>
              {summary.lowConfidenceCount} {summary.lowConfidenceCount === 1 ? "entry has" : "entries have"} low confidence — review highlighted rows
            </span>
          </div>
        )}

        {/* Action buttons */}
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
                border: `1px solid ${COLORS.greenBorder}`,
                borderRadius: 6,
                cursor: "pointer",
                background: COLORS.greenBg,
                color: COLORS.green,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = "1"; }}
            >
              Download CAPE CSV
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
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                cursor: "pointer",
                background: COLORS.bgCard,
                color: COLORS.text,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.opacity = "1"; }}
            >
              Download Audit Report
            </button>
          )}
        </div>

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
            padding: "8px 0",
            fontSize: 12,
            fontWeight: 600,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            cursor: "pointer",
            background: "transparent",
            color: COLORS.textMuted,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = COLORS.text; }}
          onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = COLORS.textMuted; }}
        >
          Upload Another Document
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, background: COLORS.bg, minHeight: "100%" }}>
      {renderModeTabs()}

      {/* === MANUAL ENTRY MODE (existing, unchanged layout) === */}
      {mode === "manual" && (
        <>
          <form onSubmit={handleCalculate} className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Country of Origin <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={countryOfOrigin}
                onChange={(e) => setCountryOfOrigin(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
              >
                <option value="">Select country...</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Entry Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  min="2025-02-01"
                  max="2026-02-23"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Entered Value (USD) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={enteredValue}
                  onChange={(e) => setEnteredValue(e.target.value)}
                  placeholder="100,000"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={calculating}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              {calculating ? "Calculating..." : "Calculate Refund"}
            </button>
          </form>

          {result && (
            <div className="mt-4 space-y-3">
              {/* Main refund card */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">
                  Estimated Refund
                </p>
                <p className="text-3xl font-bold text-emerald-700">
                  {fmtUsd(result.estimatedRefund)}
                </p>
                <p className="text-xs text-emerald-500 mt-1">
                  {fmtUsd(result.ieepaDuty)} duty + {fmtUsd(result.estimatedInterest)} interest
                </p>
              </div>

              {/* Rate breakdown */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Combined IEEPA Rate</span>
                  <span className="font-semibold text-gray-800">{fmtPct(result.ieepaRate)}</span>
                </div>
                {result.rateBreakdown.fentanyl != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 pl-2">Fentanyl</span>
                    <span className="text-gray-600">{fmtPct(result.rateBreakdown.fentanyl)}</span>
                  </div>
                )}
                {result.rateBreakdown.reciprocal != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 pl-2">Reciprocal</span>
                    <span className="text-gray-600">{fmtPct(result.rateBreakdown.reciprocal)}</span>
                  </div>
                )}
                {result.rateBreakdown.section122 != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400 pl-2">Section 122</span>
                    <span className="text-gray-600">{fmtPct(result.rateBreakdown.section122)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                  <span className="text-gray-500">Eligibility</span>
                  <span className={`font-medium ${result.eligibility === "eligible" ? "text-emerald-600" : "text-orange-600"}`}>
                    {result.eligibility === "eligible" ? "Eligible" : "Review Needed"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Your Commission</span>
                  <span className="font-semibold text-amber-600">
                    {fmtUsd(result.estimatedRefund * commissionRate / 100)}
                  </span>
                </div>
              </div>

              {/* Routing note */}
              <p className={`text-xs font-medium ${
                result.eligibility === "eligible"
                  ? "text-emerald-600"
                  : "text-red-600"
              }`}>
                {result.eligibility === "eligible"
                  ? auditSummary
                    ? `✓ Ready to file — audit score: ${auditSummary.score}`
                    : "✓ Eligible for self-filing via CAPE"
                  : auditSummary && auditSummary.failed > 0
                  ? `⚠ ${auditSummary.failed} issue${auditSummary.failed !== 1 ? "s" : ""} found — submit for review`
                  : "⚠ This entry requires legal review"}
              </p>

              {/* CTA button */}
              <button
                onClick={handleReferral}
                className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-1.5"
              >
                Submit as Referral
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
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
                background: COLORS.redBg,
                border: `1px solid ${COLORS.redBorder}`,
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 12,
                color: COLORS.red,
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
