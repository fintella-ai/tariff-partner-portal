"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import PartnerLink from "@/components/ui/PartnerLink";
import { useResizableColumns } from "@/components/ui/ResizableTable";

type DocEntry = {
  id: string;
  partnerCode: string;
  partnerName: string;
  partnerId: string | null;
  docType: string;
  fileName: string;
  fileUrl: string;
  status: string;
  uploadedBy: string;
  createdAt: string;
};

const tabs = ["All", "Needs Attention", "Approved"] as const;
type Tab = (typeof tabs)[number];

const statusBadge: Record<string, string> = {
  required: "bg-red-500/20 text-red-400",
  uploaded: "bg-blue-500/20 text-blue-400",
  under_review: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-green-500/20 text-green-400",
  voided: "bg-gray-500/20 text-gray-400 line-through",
};

function fmtDate(d: string | null) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DocumentTrackingPage() {
  const router = useRouter();
  const { columnWidths: docColWidths, getResizeHandler: getDocResizeHandler } = useResizableColumns([150, 150, 200, 100, 130, 100]);
  const [tab, setTab] = useState<Tab>("All");
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/documents/list");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const filtered = documents.filter((d) => {
    if (tab === "All") return true;
    if (tab === "Needs Attention") return d.status === "under_review" || d.status === "uploaded";
    if (tab === "Approved") return d.status === "approved";
    return true;
  });

  const totalDocs = documents.length;
  const underReview = documents.filter((d) => d.status === "under_review" || d.status === "uploaded").length;
  const approved = documents.filter((d) => d.status === "approved").length;
  const agreements = documents.filter((d) => d.docType === "agreement").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm theme-text-muted">Loading documents...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">Document Tracking</h2>
          <p className="font-body text-sm text-[var(--app-text-muted)]">Track and manage partner documents.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Documents", value: totalDocs },
          { label: "Needs Review", value: underReview, color: "text-yellow-400" },
          { label: "Approved", value: approved, color: "text-green-400" },
          { label: "Agreements", value: agreements, color: "text-brand-gold" },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">{s.label}</div>
            <div className={`font-display text-xl font-bold ${s.color || "text-[var(--app-text)]"}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* SignWell info */}
      <div className="card p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-body font-semibold text-sm">Partnership Agreements (SignWell)</div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">Send or resend agreements for e-signing</div>
          </div>
          <span className="font-body text-[10px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded px-2 py-1 uppercase tracking-wider">
            {process.env.NEXT_PUBLIC_SIGNWELL_CONFIGURED === "true" ? "Live" : "Demo Mode"}
          </span>
        </div>
        <div className="font-body text-[12px] text-[var(--app-text-muted)] bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg p-3">
          To send a partnership agreement, go to <strong className="text-[var(--app-text-secondary)]">Partners &rarr; View Partner &rarr; Documents</strong> section, or use the admin API endpoint <code className="text-brand-gold/60 bg-brand-gold/10 px-1 rounded text-[11px]">POST /api/admin/agreement/[partnerCode]</code>.
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
              tab === t ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
            }`}
          >
            {t} {t === "Needs Attention" && underReview > 0 ? `(${underReview})` : ""}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-center" style={{ width: docColWidths[0], position: "relative" }}>Partner<span {...getDocResizeHandler(0)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: docColWidths[1], position: "relative" }}>Document Type<span {...getDocResizeHandler(1)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: docColWidths[2], position: "relative" }}>File Name<span {...getDocResizeHandler(2)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: docColWidths[3], position: "relative" }}>Status<span {...getDocResizeHandler(3)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: docColWidths[4], position: "relative" }}>Upload Date<span {...getDocResizeHandler(4)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: docColWidths[5], position: "relative" }}>Actions<span {...getDocResizeHandler(5)} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-b border-[var(--app-border)] hover:bg-[var(--app-hover)] transition">
                <td className="px-4 py-3">
                  <PartnerLink partnerId={d.partnerId} className="text-[var(--app-text)]">{d.partnerName}</PartnerLink>
                  <div className="text-xs text-[var(--app-text-muted)]">{d.partnerCode}</div>
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">{d.docType === "agreement" ? "Agreement" : d.docType === "w9" ? "Tax Document (W9)" : d.docType === "bank_letter" ? "Bank Letter" : d.docType.toUpperCase()}</td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)] text-[12px] truncate max-w-[150px]">{d.fileName}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusBadge[d.status] || statusBadge.uploaded}`}>
                    {d.status === "under_review" ? "Under Review" : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">{fmtDate(d.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {d.fileUrl && (
                      <>
                        <button onClick={() => { const w = window.open(); if (w) { w.document.write(`<iframe src="${d.fileUrl}" style="width:100%;height:100vh;border:none;"></iframe>`); w.document.title = d.fileName; } }} className="text-xs text-brand-gold hover:underline">View</button>
                        <a href={d.fileUrl} download={d.fileName} className="text-xs text-blue-400 hover:underline">Download</a>
                      </>
                    )}
                    {d.status === "under_review" && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Approve this document for ${d.partnerName}?`)) return;
                          const res = await fetch("/api/admin/documents", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ documentId: d.id, action: "approve" }),
                          });
                          if (res.ok) fetchDocuments();
                        }}
                        className="text-xs text-green-400 hover:underline"
                      >
                        Approve
                      </button>
                    )}
                    {d.status === "under_review" && (
                      <button onClick={() => router.push(`/admin/partners`)} className="text-xs text-[var(--app-text-muted)] hover:underline">View Partner</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--app-text-muted)]">No documents found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {filtered.map((d) => (
          <div key={d.id} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <PartnerLink partnerId={d.partnerId} className="font-body text-sm font-medium text-[var(--app-text)]">{d.partnerName}</PartnerLink>
                <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">{d.partnerCode}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${statusBadge[d.status] || statusBadge.uploaded}`}>
                {d.status === "under_review" ? "Under Review" : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-secondary)] mb-3">
              <span>{d.docType === "agreement" ? "Agreement" : d.docType === "w9" ? "W9" : d.docType === "bank_letter" ? "Bank Letter" : d.docType}</span>
              <span>&middot;</span>
              <span>{fmtDate(d.createdAt)}</span>
              <span>&middot;</span>
              <span className="truncate max-w-[120px]">{d.fileName}</span>
            </div>
            <div className="flex gap-3">
              {d.fileUrl && (
                <>
                  <button onClick={() => { const w = window.open(); if (w) { w.document.write(`<iframe src="${d.fileUrl}" style="width:100%;height:100vh;border:none;"></iframe>`); w.document.title = d.fileName; } }} className="text-xs text-brand-gold">View</button>
                  <a href={d.fileUrl} download={d.fileName} className="text-xs text-blue-400">Download</a>
                </>
              )}
              {d.status === "under_review" && (
                <button
                  onClick={async () => {
                    if (!confirm(`Approve this document for ${d.partnerName}?`)) return;
                    const res = await fetch("/api/admin/documents", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: d.id, action: "approve" }) });
                    if (res.ok) fetchDocuments();
                  }}
                  className="text-xs text-green-400"
                >
                  Approve
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card p-6 text-center text-[var(--app-text-muted)]">No documents found.</div>
        )}
      </div>
    </div>
  );
}
