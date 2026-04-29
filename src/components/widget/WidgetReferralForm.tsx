"use client";

import { useState, type FormEvent } from "react";

interface Props {
  token: string;
  commissionRate: number;
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

export default function WidgetReferralForm({ token, commissionRate }: Props) {
  const [form, setForm] = useState({
    clientCompanyName: "",
    clientContactName: "",
    clientEmail: "",
    clientPhone: "",
    estimatedImportValue: "",
    importDateRange: [] as string[],
    htsCodes: "",
    tmsReference: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; referralId?: string; message?: string; duplicate?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="p-6 text-center space-y-4">
        <div className="text-5xl">{result.duplicate ? "ℹ️" : "✅"}</div>
        <h3 className="text-lg font-semibold text-gray-800">
          {result.duplicate ? "Already Referred" : "Referral Submitted!"}
        </h3>
        <p className="text-sm text-gray-500">{result.message}</p>
        <p className="text-xs text-gray-400">Tracking ID: {result.referralId}</p>
        <button
          onClick={() => {
            setResult(null);
            setForm({
              clientCompanyName: "",
              clientContactName: "",
              clientEmail: "",
              clientPhone: "",
              estimatedImportValue: "",
              importDateRange: [],
              htsCodes: "",
              tmsReference: "",
            });
          }}
          className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Refer Another Client
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Client Company Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          value={form.clientCompanyName}
          onChange={(e) => set("clientCompanyName", e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
          placeholder="Acme Imports LLC"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Contact Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.clientContactName}
            onChange={(e) => set("clientContactName", e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Contact Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={form.clientEmail}
            onChange={(e) => set("clientEmail", e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Contact Phone</label>
        <input
          type="tel"
          value={form.clientPhone}
          onChange={(e) => set("clientPhone", e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
          placeholder="+1 (555) 123-4567"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Import Value</label>
        <select
          value={form.estimatedImportValue}
          onChange={(e) => set("estimatedImportValue", e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
        >
          <option value="">Select range...</option>
          {VALUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Import Period</label>
        <div className="space-y-1">
          {PERIOD_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.importDateRange.includes(o.value)}
                onChange={() => togglePeriod(o.value)}
                className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          HTS Codes <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          value={form.htsCodes}
          onChange={(e) => set("htsCodes", e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
          placeholder="Paste relevant HTS codes, separated by commas"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Internal Reference # <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={form.tmsReference}
          onChange={(e) => set("tmsReference", e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
          placeholder="CargoWise/Magaya client ID"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm mt-2"
      >
        {submitting ? "Submitting..." : `Refer This Client — Earn ${commissionRate}%`}
      </button>
    </form>
  );
}
