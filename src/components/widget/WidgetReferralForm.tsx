"use client";

import { useState, useEffect, type FormEvent, type CSSProperties } from "react";
import { W, RADII, SHADOWS, glassCardStyle, goldButtonStyle, greenButtonStyle, inputStyle, goldGradientStyle } from "./widget-theme";

interface Props {
  token: string;
  commissionRate: number;
  prefill?: { estimatedImportValue?: string; importDateRange?: string; documentUrls?: string[] } | null;
  onPrefillConsumed?: () => void;
}

const VALUE_OPTIONS = [
  { label: "Under $50K", value: "<$50K" },
  { label: "$50K – $500K", value: "$50K-$500K" },
  { label: "$500K – $2M", value: "$500K-$2M" },
  { label: "Over $2M", value: "$2M+" },
];

const PERIOD_OPTIONS = [
  { label: "Feb–May 2025 (Section 232/301)", value: "Feb-May 2025 (Section 232/301)" },
  { label: "Post April 5 (IEEPA 10%)", value: "Post April 5 (IEEPA 10%)" },
  { label: "Post April 9 (IEEPA 145%)", value: "Post April 9 (IEEPA 145%)" },
];

const labelStyle: CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 500,
  color: W.textSecondary, marginBottom: 6,
};

export default function WidgetReferralForm({ token, commissionRate, prefill, onPrefillConsumed }: Props) {
  const [form, setForm] = useState({
    clientCompanyName: "",
    clientContactName: "",
    clientEmail: "",
    clientPhone: "",
    estimatedImportValue: "",
    importDateRange: [] as string[],
    htsCodes: "",
    tmsReference: "",
    isImporterOfRecord: null as boolean | null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; referralId?: string; message?: string; duplicate?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrefill, setShowPrefill] = useState(false);

  useEffect(() => {
    if (prefill) {
      setForm((f) => ({
        ...f,
        estimatedImportValue: prefill.estimatedImportValue || f.estimatedImportValue,
      }));
      setShowPrefill(true);
    }
  }, [prefill]);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const togglePeriod = (val: string) => {
    setForm((f) => ({
      ...f,
      importDateRange: f.importDateRange.includes(val)
        ? f.importDateRange.filter((v) => v !== val)
        : [...f.importDateRange, val],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/widget/referral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          importDateRange: form.importDateRange.join("; "),
          htsCodes: form.htsCodes.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
          documentUrls: prefill?.documentUrls || [],
          isImporterOfRecord: form.isImporterOfRecord ?? true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.success) {
    return (
      <div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <div style={{ fontSize: 48 }}>{result.duplicate ? "ℹ️" : "✅"}</div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: W.text, fontFamily: "'DM Serif Display', Georgia, serif", margin: 0 }}>
          {result.duplicate ? "Already Referred" : "Referral Submitted!"}
        </h3>
        <p style={{ fontSize: 13, color: W.textSecondary, margin: 0 }}>{result.message}</p>
        <p style={{ fontSize: 11, color: W.textDim }}>
          Tracking ID: <span style={{ ...goldGradientStyle(), fontWeight: 600 }}>{result.referralId}</span>
        </p>
        <button
          onClick={() => {
            setResult(null);
            setShowPrefill(false);
            onPrefillConsumed?.();
            setForm({
              clientCompanyName: "", clientContactName: "", clientEmail: "",
              clientPhone: "", estimatedImportValue: "", importDateRange: [],
              htsCodes: "", tmsReference: "", isImporterOfRecord: null,
            });
          }}
          style={{
            background: "transparent", border: `1px solid ${W.border}`,
            color: W.textSecondary, borderRadius: RADII.sm, padding: "10px 24px",
            fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.2s",
          }}
        >
          Refer Another Client
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {error && (
        <div style={{
          ...glassCardStyle(), borderColor: "rgba(239,68,68,0.2)",
          padding: "10px 14px", fontSize: 12, color: W.red,
        }}>
          {error}
        </div>
      )}

      {showPrefill && prefill && (
        <div style={{
          ...glassCardStyle(), padding: 14,
          borderLeft: `3px solid ${W.gold}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, color: W.textDim, marginBottom: 4 }}>From your calculation:</div>
            <div style={{ fontSize: 13, color: W.text, fontWeight: 500 }}>
              {prefill.estimatedImportValue}
              {prefill.importDateRange ? ` · ${prefill.importDateRange}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setShowPrefill(false); onPrefillConsumed?.(); }}
            style={{
              background: "none", border: "none", color: W.textDim,
              fontSize: 11, cursor: "pointer", textDecoration: "underline",
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div>
        <label style={labelStyle}>
          Client Company Name <span style={{ color: W.red }}>*</span>
        </label>
        <input
          type="text" required value={form.clientCompanyName}
          onChange={(e) => set("clientCompanyName", e.target.value)}
          style={inputStyle()} placeholder="Acme Imports LLC"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={labelStyle}>
            Contact Name <span style={{ color: W.red }}>*</span>
          </label>
          <input
            type="text" required value={form.clientContactName}
            onChange={(e) => set("clientContactName", e.target.value)}
            style={inputStyle()}
          />
        </div>
        <div>
          <label style={labelStyle}>
            Contact Email <span style={{ color: W.red }}>*</span>
          </label>
          <input
            type="email" required value={form.clientEmail}
            onChange={(e) => set("clientEmail", e.target.value)}
            style={inputStyle()}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Contact Phone</label>
        <input
          type="tel" value={form.clientPhone}
          onChange={(e) => set("clientPhone", e.target.value)}
          style={inputStyle()} placeholder="+1 (555) 123-4567"
        />
      </div>

      <div>
        <label style={labelStyle}>
          Is the client the Importer of Record? <span style={{ color: W.red }}>*</span>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Yes", value: true },
            { label: "No", value: false },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setForm((f) => ({ ...f, isImporterOfRecord: opt.value }))}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: RADII.sm,
                border: `1px solid ${form.isImporterOfRecord === opt.value ? W.gold : W.border}`,
                background: form.isImporterOfRecord === opt.value
                  ? "rgba(196,160,80,0.12)"
                  : "rgba(255,255,255,0.03)",
                color: form.isImporterOfRecord === opt.value ? W.gold : W.textSecondary,
                fontSize: 13,
                fontWeight: form.isImporterOfRecord === opt.value ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {form.isImporterOfRecord === false && (
          <div style={{
            marginTop: 6, padding: "8px 12px", fontSize: 11,
            color: W.textDim, background: "rgba(196,160,80,0.06)",
            borderRadius: RADII.sm, borderLeft: `2px solid ${W.gold}`,
          }}>
            Tier 2 client — commission rates are adjusted for non-IOR filings.
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>Estimated Import Value</label>
        <select
          value={form.estimatedImportValue}
          onChange={(e) => set("estimatedImportValue", e.target.value)}
          style={{ ...inputStyle(), appearance: "auto" as CSSProperties["appearance"] }}
        >
          <option value="">Select range...</option>
          {VALUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Import Period</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {PERIOD_OPTIONS.map((o) => (
            <label key={o.value} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, color: W.textSecondary, cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={form.importDateRange.includes(o.value)}
                onChange={() => togglePeriod(o.value)}
                style={{ accentColor: W.gold }}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>
          HTS Codes <span style={{ color: W.textDim }}>(optional)</span>
        </label>
        <textarea
          value={form.htsCodes}
          onChange={(e) => set("htsCodes", e.target.value)}
          rows={2}
          style={{ ...inputStyle(), resize: "none" }}
          placeholder="Paste relevant HTS codes, separated by commas"
        />
      </div>

      <div>
        <label style={labelStyle}>
          Internal Reference # <span style={{ color: W.textDim }}>(optional)</span>
        </label>
        <input
          type="text" value={form.tmsReference}
          onChange={(e) => set("tmsReference", e.target.value)}
          style={inputStyle()} placeholder="CargoWise/Magaya client ID"
        />
      </div>

      <button type="submit" disabled={submitting} style={{ ...greenButtonStyle(submitting), marginTop: 4 }}>
        {submitting ? "Submitting..." : "Submit Client 🚀 Law Firm"}
      </button>
    </form>
  );
}
