"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";

const DEAL_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: "", label: "— Skip this column —" },
  { key: "dealName", label: "Deal Name" },
  { key: "clientFirstName", label: "Client First Name" },
  { key: "clientLastName", label: "Client Last Name" },
  { key: "clientName", label: "Client Full Name" },
  { key: "clientEmail", label: "Client Email" },
  { key: "clientPhone", label: "Client Phone" },
  { key: "clientTitle", label: "Client Title / Job Title" },
  { key: "partnerCode", label: "Partner Code" },
  { key: "stage", label: "Deal Stage" },
  { key: "legalEntityName", label: "Company / Legal Entity" },
  { key: "companyEin", label: "Company EIN" },
  { key: "businessStreetAddress", label: "Street Address" },
  { key: "businessStreetAddress2", label: "Street Address 2" },
  { key: "businessCity", label: "City" },
  { key: "businessState", label: "State" },
  { key: "businessZip", label: "Zip Code" },
  { key: "serviceOfInterest", label: "Service of Interest" },
  { key: "importsGoods", label: "Imports Goods (Yes/No)" },
  { key: "importCountries", label: "Import Countries" },
  { key: "annualImportValue", label: "Annual Import Value" },
  { key: "importerOfRecord", label: "Importer of Record" },
  { key: "affiliateNotes", label: "Affiliate Notes" },
  { key: "epLevel1", label: "Enterprise Partner (EP)" },
  { key: "externalDealId", label: "HubSpot Deal ID (hs_object_id)" },
  { key: "estimatedRefundAmount", label: "Estimated Refund Amount" },
  { key: "actualRefundAmount", label: "Actual Refund Amount" },
  { key: "firmFeeRate", label: "Firm Fee Rate (%)" },
  { key: "firmFeeAmount", label: "Firm Fee Amount" },
  { key: "l1CommissionRate", label: "L1 Commission Rate (%)" },
  { key: "l1CommissionAmount", label: "L1 Commission Amount" },
  { key: "consultBookedDate", label: "Consultation Date" },
  { key: "consultBookedTime", label: "Consultation Time" },
  { key: "notes", label: "Notes" },
];

const AUTO_MAP: Record<string, string> = {
  "deal name": "dealName",
  "deal_name": "dealName",
  "dealname": "dealName",
  "first name": "clientFirstName",
  "first_name": "clientFirstName",
  "firstname": "clientFirstName",
  "fname": "clientFirstName",
  "last name": "clientLastName",
  "last_name": "clientLastName",
  "lastname": "clientLastName",
  "lname": "clientLastName",
  "name": "clientName",
  "full name": "clientName",
  "client name": "clientName",
  "email": "clientEmail",
  "e-mail": "clientEmail",
  "client email": "clientEmail",
  "email address": "clientEmail",
  "phone": "clientPhone",
  "phone number": "clientPhone",
  "telephone": "clientPhone",
  "title": "clientTitle",
  "job title": "clientTitle",
  "jobtitle": "clientTitle",
  "business title": "clientTitle",
  "partner code": "partnerCode",
  "partner_code": "partnerCode",
  "partnercode": "partnerCode",
  "utm_content": "partnerCode",
  "referral code": "partnerCode",
  "referralcode": "partnerCode",
  "stage": "stage",
  "deal stage": "stage",
  "dealstage": "stage",
  "pipeline stage": "stage",
  "status": "stage",
  "company": "legalEntityName",
  "company name": "legalEntityName",
  "business name": "legalEntityName",
  "legal entity": "legalEntityName",
  "legal entity name": "legalEntityName",
  "ein": "companyEin",
  "company ein": "companyEin",
  "tax id": "companyEin",
  "address": "businessStreetAddress",
  "street address": "businessStreetAddress",
  "address 2": "businessStreetAddress2",
  "suite": "businessStreetAddress2",
  "city": "businessCity",
  "state": "businessState",
  "zip": "businessZip",
  "zip code": "businessZip",
  "postal code": "businessZip",
  "service": "serviceOfInterest",
  "service of interest": "serviceOfInterest",
  "imports goods": "importsGoods",
  "import countries": "importCountries",
  "countries": "importCountries",
  "annual import value": "annualImportValue",
  "import value": "annualImportValue",
  "importer of record": "importerOfRecord",
  "notes": "notes",
  "affiliate notes": "affiliateNotes",
  "comments": "affiliateNotes",
  "hs_object_id": "externalDealId",
  "hubspot id": "externalDealId",
  "external id": "externalDealId",
  "refund amount": "estimatedRefundAmount",
  "estimated refund": "estimatedRefundAmount",
  "estimated refund amount": "estimatedRefundAmount",
  "actual refund": "actualRefundAmount",
  "actual refund amount": "actualRefundAmount",
  "firm fee rate": "firmFeeRate",
  "fee rate": "firmFeeRate",
  "firm fee": "firmFeeAmount",
  "firm fee amount": "firmFeeAmount",
  "commission rate": "l1CommissionRate",
  "l1 commission rate": "l1CommissionRate",
  "commission amount": "l1CommissionAmount",
  "consultation date": "consultBookedDate",
  "consult date": "consultBookedDate",
  "consultation time": "consultBookedTime",
  "ep": "epLevel1",
  "enterprise partner": "epLevel1",
};

function autoMapHeader(header: string): string {
  const normalized = header.toLowerCase().trim().replace(/[_\-]+/g, " ");
  return AUTO_MAP[normalized] || AUTO_MAP[header.toLowerCase().trim()] || "";
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter((r) => r.some((c) => c));
  return { headers, rows };
}

type Step = "upload" | "map" | "preview" | "importing" | "done";

export default function DealImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: Array<{ row: number; error: string }> } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      setHeaders(h);
      setRows(r);
      const autoMap: Record<number, string> = {};
      h.forEach((header, idx) => {
        const matched = autoMapHeader(header);
        if (matched) autoMap[idx] = matched;
      });
      setMapping(autoMap);
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".tsv") || file.name.endsWith(".txt"))) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const mappedRows = useMemo(() => {
    return rows.map((row) => {
      const mapped: Record<string, string> = {};
      Object.entries(mapping).forEach(([colIdx, fieldKey]) => {
        if (fieldKey && row[parseInt(colIdx)]) {
          mapped[fieldKey] = row[parseInt(colIdx)];
        }
      });
      return mapped;
    });
  }, [rows, mapping]);

  const mappedFieldKeys = useMemo(() => {
    return Object.values(mapping).filter(Boolean);
  }, [mapping]);

  const handleImport = async () => {
    setImporting(true);
    setStep("importing");
    try {
      const res = await fetch("/api/admin/deals/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mappedRows }),
      });
      const data = await res.json();
      setImportResult(data);
      setStep("done");
    } catch (e: any) {
      setImportResult({ created: 0, errors: [{ row: 0, error: e.message || "Network error" }] });
      setStep("done");
    } finally {
      setImporting(false);
    }
  };

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[12px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none";

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold">Import Deals</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Upload a CSV file and map columns to deal fields — HubSpot style.
          </p>
        </div>
        <button onClick={() => router.push("/admin/deals")}
          className="font-body text-[11px] border border-[var(--app-border)] theme-text-muted rounded-lg px-4 py-2 hover:border-brand-gold/20 transition-colors">
          ← Back to Deals
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(["upload", "map", "preview", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-body text-[12px] font-bold border ${
              step === s || (["map", "preview", "importing", "done"].indexOf(step) >= i)
                ? "bg-brand-gold/10 border-brand-gold text-brand-gold"
                : "border-[var(--app-border)] theme-text-muted"
            }`}>
              {i + 1}
            </div>
            <span className={`font-body text-[12px] ${step === s ? "text-brand-gold font-semibold" : "theme-text-muted"}`}>
              {s === "upload" ? "Upload" : s === "map" ? "Map Columns" : s === "preview" ? "Preview" : "Complete"}
            </span>
            {i < 3 && <div className="w-8 h-px bg-[var(--app-border)]" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          className={`card p-12 text-center border-2 border-dashed transition-colors cursor-pointer ${
            dragOver ? "border-brand-gold bg-brand-gold/5" : "border-[var(--app-border)]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("csv-input")?.click()}
        >
          <div className="text-4xl mb-4">📄</div>
          <div className="font-display text-lg font-semibold mb-2">Drop your CSV file here</div>
          <div className="font-body text-[13px] theme-text-muted mb-4">or click to browse</div>
          <div className="font-body text-[11px] theme-text-faint">Supports .csv files up to 500 rows</div>
          <input id="csv-input" type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileInput} />
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === "map" && (
        <div>
          <div className="card overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-[var(--app-border)]">
              <div className="font-body font-semibold text-sm">Map Columns to Deal Fields</div>
              <div className="font-body text-[11px] theme-text-muted">
                {fileName} — {rows.length} rows, {headers.length} columns. Auto-matched columns are highlighted.
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--app-border)]">
                    <th className="text-left px-4 py-3 font-body text-[10px] uppercase tracking-wider theme-text-muted w-[200px]">CSV Column</th>
                    <th className="text-left px-4 py-3 font-body text-[10px] uppercase tracking-wider theme-text-muted w-[250px]">Maps To</th>
                    <th className="text-left px-4 py-3 font-body text-[10px] uppercase tracking-wider theme-text-muted">Sample Data (first 3 rows)</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, idx) => (
                    <tr key={idx} className={`border-b border-[var(--app-border)] ${mapping[idx] ? "bg-brand-gold/[0.03]" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{header}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={mapping[idx] || ""}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [idx]: e.target.value }))}
                          className={inputClass}
                        >
                          {DEAL_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {rows.slice(0, 3).map((row, ri) => (
                            <span key={ri} className="font-mono text-[11px] theme-text-muted bg-[var(--app-input-bg)] rounded px-2 py-0.5 max-w-[150px] truncate">
                              {row[idx] || "—"}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setStep("upload")}
              className="font-body text-[12px] theme-text-muted hover:text-[var(--app-text)] transition-colors">
              ← Back
            </button>
            <button onClick={() => setStep("preview")}
              disabled={mappedFieldKeys.length === 0}
              className="btn-gold text-[11px] px-6 py-2.5 disabled:opacity-50">
              Preview {rows.length} Rows →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && (
        <div>
          <div className="card overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-[var(--app-border)]">
              <div className="font-body font-semibold text-sm">Preview Import</div>
              <div className="font-body text-[11px] theme-text-muted">
                {rows.length} deals will be created with {mappedFieldKeys.length} mapped fields. Review the data below.
              </div>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0" style={{ background: "var(--app-bg-secondary)" }}>
                  <tr>
                    <th className="px-3 py-2 font-body text-[10px] uppercase tracking-wider theme-text-muted border-b border-[var(--app-border)]">#</th>
                    {mappedFieldKeys.map((key) => (
                      <th key={key} className="px-3 py-2 font-body text-[10px] uppercase tracking-wider theme-text-muted border-b border-[var(--app-border)] whitespace-nowrap">
                        {DEAL_FIELDS.find((f) => f.key === key)?.label || key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-[var(--app-border)] hover:bg-[var(--app-hover)]">
                      <td className="px-3 py-2 font-mono text-[11px] theme-text-faint">{i + 1}</td>
                      {mappedFieldKeys.map((key) => (
                        <td key={key} className="px-3 py-2 font-body text-[12px] text-[var(--app-text)] max-w-[200px] truncate">
                          {row[key] || <span className="theme-text-faint">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 50 && (
              <div className="px-5 py-2 text-center font-body text-[11px] theme-text-muted border-t border-[var(--app-border)]">
                Showing first 50 of {rows.length} rows
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setStep("map")}
              className="font-body text-[12px] theme-text-muted hover:text-[var(--app-text)] transition-colors">
              ← Back to Mapping
            </button>
            <button onClick={handleImport}
              className="btn-gold text-[11px] px-6 py-2.5">
              Import {rows.length} Deals
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === "importing" && (
        <div className="card p-12 text-center">
          <div className="spinner mx-auto mb-4" />
          <div className="font-display text-lg font-semibold mb-2">Importing deals...</div>
          <div className="font-body text-[13px] theme-text-muted">Please wait while we create {rows.length} deals.</div>
        </div>
      )}

      {/* Step 5: Done */}
      {step === "done" && importResult && (
        <div className="card p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">{importResult.errors.length === 0 ? "✅" : "⚠️"}</div>
            <div className="font-display text-xl font-semibold mb-1">
              {importResult.created} Deal{importResult.created !== 1 ? "s" : ""} Imported
            </div>
            {importResult.errors.length > 0 && (
              <div className="font-body text-[13px] text-red-400">
                {importResult.errors.length} row{importResult.errors.length !== 1 ? "s" : ""} failed
              </div>
            )}
          </div>

          {importResult.errors.length > 0 && (
            <div className="mb-6">
              <div className="font-body text-[11px] uppercase tracking-wider theme-text-muted mb-2">Errors</div>
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-red-500/20">
                {importResult.errors.map((err, i) => (
                  <div key={i} className="px-4 py-2 border-b border-red-500/10 last:border-0">
                    <span className="font-mono text-[11px] text-red-400">Row {err.row}:</span>
                    <span className="font-body text-[11px] theme-text-muted ml-2">{err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            <button onClick={() => router.push("/admin/deals")}
              className="btn-gold text-[11px] px-6 py-2.5">
              View Deals
            </button>
            <button onClick={() => { setStep("upload"); setRows([]); setHeaders([]); setMapping({}); setImportResult(null); }}
              className="font-body text-[12px] theme-text-muted hover:text-[var(--app-text)] transition-colors">
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
