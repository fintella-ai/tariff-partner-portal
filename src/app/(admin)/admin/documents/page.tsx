"use client";

import { useState, useEffect } from "react";

type DocEntry = {
  id: string;
  partnerName: string;
  partnerCode: string;
  docType: "W9" | "Tax Form" | "Agreement";
  status: "required" | "uploaded" | "under_review" | "approved";
  uploadDate: string | null;
  hasIncome: boolean;
};

const documents: DocEntry[] = [
  {
    id: "DOC-001",
    partnerName: "Summit Legal Group",
    partnerCode: "SLG-001",
    docType: "W9",
    status: "required",
    uploadDate: null,
    hasIncome: true,
  },
  {
    id: "DOC-002",
    partnerName: "Apex Trade Advisors",
    partnerCode: "ATA-012",
    docType: "W9",
    status: "under_review",
    uploadDate: "2026-03-15",
    hasIncome: true,
  },
  {
    id: "DOC-003",
    partnerName: "Redstone Recovery LLC",
    partnerCode: "RRL-045",
    docType: "Tax Form",
    status: "approved",
    uploadDate: "2026-02-28",
    hasIncome: true,
  },
  {
    id: "DOC-004",
    partnerName: "Pinnacle Partners",
    partnerCode: "PP-008",
    docType: "W9",
    status: "approved",
    uploadDate: "2026-01-20",
    hasIncome: true,
  },
  {
    id: "DOC-005",
    partnerName: "Liberty Tariff Solutions",
    partnerCode: "LTS-023",
    docType: "Agreement",
    status: "uploaded",
    uploadDate: "2026-03-22",
    hasIncome: false,
  },
  {
    id: "DOC-006",
    partnerName: "Northgate Consulting",
    partnerCode: "NGC-031",
    docType: "W9",
    status: "required",
    uploadDate: null,
    hasIncome: true,
  },
];

const tabs = ["All", "Needs Attention", "Approved"] as const;
type Tab = (typeof tabs)[number];

const statusBadge: Record<DocEntry["status"], string> = {
  required: "bg-red-500/20 text-red-400",
  uploaded: "bg-blue-500/20 text-blue-400",
  under_review: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-green-500/20 text-green-400",
};

const statusLabel: Record<DocEntry["status"], string> = {
  required: "Required",
  uploaded: "Uploaded",
  under_review: "Under Review",
  approved: "Approved",
};

function needsAttention(d: DocEntry) {
  return d.status === "required" && d.hasIncome;
}

function fmtDate(d: string | null) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DocumentTrackingPage() {
  const [tab, setTab] = useState<Tab>("All");

  const filtered = documents.filter((d) => {
    if (tab === "All") return true;
    if (tab === "Needs Attention") return needsAttention(d);
    if (tab === "Approved") return d.status === "approved";
    return true;
  });

  const totalPartners = new Set(documents.map((d) => d.partnerCode)).size;
  const w9Pending = documents.filter(
    (d) => d.docType === "W9" && d.status === "required"
  ).length;
  const underReview = documents.filter(
    (d) => d.status === "under_review"
  ).length;
  const approved = documents.filter((d) => d.status === "approved").length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">
            Document Tracking
          </h2>
          <p className="font-body text-sm text-white/40">
            Track and manage partner documents.
          </p>
        </div>
        <button className="btn-gold text-sm px-4 py-2 rounded-lg font-body self-start">
          Send W9 Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Partners", value: totalPartners },
          { label: "W9 Pending", value: w9Pending },
          { label: "Under Review", value: underReview },
          { label: "Approved", value: approved },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="font-body text-xs text-white/40 mb-1">
              {s.label}
            </div>
            <div className="font-display text-xl font-bold text-brand-gold">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── SignWell Agreement Quick Actions ─────────────────────────────── */}
      <div className="card p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-body font-semibold text-sm">Partnership Agreements (SignWell)</div>
            <div className="font-body text-[11px] text-white/35 mt-0.5">Send or resend agreements for e-signing</div>
          </div>
          <span className="font-body text-[10px] text-white/30 border border-white/10 rounded px-2 py-1 uppercase tracking-wider">
            {process.env.NEXT_PUBLIC_SIGNWELL_CONFIGURED === "true" ? "Live" : "Demo Mode"}
          </span>
        </div>
        <div className="font-body text-[12px] text-white/40 bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
          To send a partnership agreement, go to <strong className="text-white/60">Partners &rarr; View Partner &rarr; Documents</strong> section, or use the admin API endpoint <code className="text-brand-gold/60 bg-brand-gold/10 px-1 rounded text-[11px]">POST /api/admin/agreement/[partnerCode]</code>.
          {" "}Webhook callbacks from SignWell automatically update agreement status when signed.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              tab === t
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-white/5 text-white/50 hover:text-white/70"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-left font-body text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Document Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Upload Date</th>
              <th className="px-4 py-3">Income Generated?</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr
                key={d.id}
                className="border-b border-white/5 hover:bg-white/[0.02] transition"
              >
                <td className="px-4 py-3">
                  <div className="text-white/80">{d.partnerName}</div>
                  <div className="text-xs text-white/35">{d.partnerCode}</div>
                </td>
                <td className="px-4 py-3 text-white/60">{d.docType}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusBadge[d.status]}`}
                  >
                    {statusLabel[d.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/50">
                  {fmtDate(d.uploadDate)}
                </td>
                <td className="px-4 py-3">
                  {d.hasIncome ? (
                    <span className="text-green-400 text-xs">Yes</span>
                  ) : (
                    <span className="text-white/30 text-xs">No</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {d.status === "uploaded" || d.status === "under_review" ? (
                      <button className="text-xs text-brand-gold hover:underline">
                        Review
                      </button>
                    ) : d.status === "required" ? (
                      <button className="text-xs text-brand-gold hover:underline">
                        Send Request
                      </button>
                    ) : (
                      <span className="text-xs text-white/25">
                        No action needed
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {filtered.map((d) => (
          <div key={d.id} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-body text-sm font-medium text-white">
                  {d.partnerName}
                </div>
                <div className="font-body text-xs text-white/35 mt-0.5">
                  {d.partnerCode}
                </div>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusBadge[d.status]}`}
              >
                {statusLabel[d.status]}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/50 mb-3">
              <span>{d.docType}</span>
              <span>&middot;</span>
              <span>{fmtDate(d.uploadDate)}</span>
              <span>&middot;</span>
              <span>Income: {d.hasIncome ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-end">
              {d.status === "uploaded" || d.status === "under_review" ? (
                <button className="text-xs text-brand-gold hover:underline">
                  Review
                </button>
              ) : d.status === "required" ? (
                <button className="text-xs text-brand-gold hover:underline">
                  Send Request
                </button>
              ) : (
                <span className="text-xs text-white/25">No action needed</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
