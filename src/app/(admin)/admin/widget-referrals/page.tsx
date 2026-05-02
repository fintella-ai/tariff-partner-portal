"use client";

import { useState, useEffect, useCallback } from "react";

interface WidgetReferralRow {
  id: string;
  partner: { firstName: string; lastName: string; partnerCode: string };
  widgetSession: { platform: string };
  clientCompanyName: string;
  clientContactName: string;
  clientEmail: string;
  clientPhone: string | null;
  estimatedImportValue: string | null;
  htsCodes: string[];
  tmsReference: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  referralId: string | null;
  entryCount: number | null;
  importDateRange: string | null;
  documentUrls: string[];
}

const STATUS_OPTIONS = ["submitted", "contacted", "qualified", "converted", "rejected", "archived"];
const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  contacted: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  qualified: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  converted: "bg-green-500/10 text-green-400 border border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border border-red-500/20",
  archived: "bg-gray-500/10 text-gray-400 border border-gray-500/20",
};

export default function AdminWidgetReferralsPage() {
  const [referrals, setReferrals] = useState<WidgetReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<WidgetReferralRow>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/widget-referrals");
      const data = await res.json();
      setReferrals(data.referrals || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/widget-referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    await fetch(`/api/admin/widget-referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData),
    });
    setEditId(null);
    setEditData({});
    setSaving(false);
    load();
  };

  const deleteReferral = async (id: string) => {
    await fetch(`/api/admin/widget-referrals/${id}`, { method: "DELETE" });
    setDeleteConfirmId(null);
    load();
  };

  const startEdit = (r: WidgetReferralRow) => {
    setEditId(r.id);
    setEditData({
      clientCompanyName: r.clientCompanyName,
      clientContactName: r.clientContactName,
      clientEmail: r.clientEmail,
      clientPhone: r.clientPhone,
      estimatedImportValue: r.estimatedImportValue,
      tmsReference: r.tmsReference,
      notes: r.notes,
    });
    setExpandedId(r.id);
  };

  const q = search.toLowerCase();
  const filtered = referrals
    .filter((r) => filter === "all" ? r.status !== "archived" : r.status === filter)
    .filter((r) =>
      !q ||
      r.clientCompanyName.toLowerCase().includes(q) ||
      r.clientContactName.toLowerCase().includes(q) ||
      r.clientEmail.toLowerCase().includes(q) ||
      r.partner.partnerCode.toLowerCase().includes(q) ||
      `${r.partner.firstName} ${r.partner.lastName}`.toLowerCase().includes(q)
    );

  const counts = {
    all: referrals.filter((r) => r.status !== "archived").length,
    submitted: referrals.filter((r) => r.status === "submitted").length,
    contacted: referrals.filter((r) => r.status === "contacted").length,
    qualified: referrals.filter((r) => r.status === "qualified").length,
    converted: referrals.filter((r) => r.status === "converted").length,
    rejected: referrals.filter((r) => r.status === "rejected").length,
    archived: referrals.filter((r) => r.status === "archived").length,
  };

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--app-text)]">Widget Referrals</h1>
          <p className="font-body text-sm text-[var(--app-text-muted)]">
            {referrals.length} total · {counts.submitted} pending · {counts.converted} converted
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {(["all", ...STATUS_OPTIONS] as const).map((s) => {
          const active = filter === s;
          const count = counts[s as keyof typeof counts] ?? 0;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`font-body text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${
                active
                  ? "text-brand-gold border-brand-gold/30 bg-brand-gold/10"
                  : "text-[var(--app-text-muted)] border-[var(--app-border)] hover:text-[var(--app-text-secondary)] hover:bg-brand-gold/5"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              {count > 0 && <span className="ml-1.5 text-[10px] opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by client, company, email, or partner..."
        className={inputClass + " max-w-md"}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--app-text-muted)] font-body">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--app-text-muted)] font-body">No submissions found.</div>
      ) : (
        <div className="space-y-0">
          <div className="font-body text-[12px] text-[var(--app-text-muted)] mb-2">Showing {filtered.length} submissions</div>

          {/* Table header */}
          <div className="card overflow-hidden">
            <div className="hidden sm:grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_1fr_1.2fr_auto] gap-2 px-4 py-2.5 border-b border-[var(--app-border)] items-center">
              {["CLIENT", "COMPANY", "LOCATION", "EST. REFUND", "PARTNER", "SOURCE", "DEAL STAGE", "MATCH", "DATE"].map((h) => (
                <div key={h} className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">{h}</div>
              ))}
            </div>

            {/* Rows */}
            {filtered.map((r) => {
              const isExpanded = expandedId === r.id;
              const isEditing = editId === r.id;
              return (
                <div key={r.id} className="border-b border-[var(--app-border)] last:border-b-0">
                  {/* Main row */}
                  <div
                    className={`hidden sm:grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_1fr_1.2fr_auto] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-brand-gold/[0.03] transition-colors ${isExpanded ? "bg-brand-gold/[0.05]" : ""}`}
                    onClick={() => { setExpandedId(isExpanded ? null : r.id); if (isEditing && !isExpanded) setEditId(null); }}
                  >
                    <div>
                      <div className="font-body text-[13px] text-[var(--app-text)] font-medium">{r.clientContactName}</div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)]">{r.clientEmail}</div>
                      {r.clientPhone && <div className="font-body text-[10px] text-[var(--app-text-muted)]">{r.clientPhone}</div>}
                    </div>
                    <div className="font-body text-[13px] text-[var(--app-text)]">{r.clientCompanyName}</div>
                    <div className="font-body text-[12px] text-[var(--app-text-muted)]">—</div>
                    <div className="font-body text-[13px] text-green-400 font-semibold">
                      {r.estimatedImportValue ? `$${Number(r.estimatedImportValue).toLocaleString()}` : "—"}
                    </div>
                    <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{r.partner.partnerCode}</div>
                    <div className="font-body text-[12px] text-[var(--app-text-muted)] capitalize">{r.widgetSession.platform}</div>
                    <div>
                      <select
                        value={r.status}
                        onChange={(e) => { e.stopPropagation(); updateStatus(r.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase cursor-pointer border-0 ${STATUS_BADGE[r.status] || ""}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      {r.referralId ? (
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase bg-green-500/10 text-green-400 border border-green-500/20">MATCHED</span>
                      ) : (
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase bg-red-500/10 text-red-400 border border-red-500/20">NOT FOUND</span>
                      )}
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      <span className="block text-[10px]">{new Date(r.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                  </div>

                  {/* Mobile row */}
                  <div
                    className="sm:hidden p-4 cursor-pointer hover:bg-brand-gold/[0.03]"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{r.clientContactName}</div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)]">{r.clientCompanyName}</div>
                      </div>
                      <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${STATUS_BADGE[r.status] || ""}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="font-body text-[12px] text-green-400 font-semibold">
                        {r.estimatedImportValue ? `$${Number(r.estimatedImportValue).toLocaleString()}` : "—"}
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)]">{r.partner.partnerCode}</div>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-[var(--app-bg-secondary)] border-t border-[var(--app-border)]">
                      <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Column 1 — Client Info */}
                        <div className="space-y-3">
                          <div className="font-body text-[11px] text-brand-gold uppercase tracking-wider font-semibold mb-2">Client Details</div>
                          {isEditing ? (
                            <>
                              <div>
                                <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase">Contact Name</label>
                                <input className={inputClass} value={editData.clientContactName || ""} onChange={(e) => setEditData({ ...editData, clientContactName: e.target.value })} />
                              </div>
                              <div>
                                <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase">Company</label>
                                <input className={inputClass} value={editData.clientCompanyName || ""} onChange={(e) => setEditData({ ...editData, clientCompanyName: e.target.value })} />
                              </div>
                              <div>
                                <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase">Email</label>
                                <input className={inputClass} value={editData.clientEmail || ""} onChange={(e) => setEditData({ ...editData, clientEmail: e.target.value })} />
                              </div>
                              <div>
                                <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase">Phone</label>
                                <input className={inputClass} value={editData.clientPhone || ""} onChange={(e) => setEditData({ ...editData, clientPhone: e.target.value })} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Contact</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.clientContactName}</span></div>
                              <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Company</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.clientCompanyName}</span></div>
                              <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Email</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.clientEmail}</span></div>
                              <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Phone</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.clientPhone || "—"}</span></div>
                            </>
                          )}
                        </div>

                        {/* Column 2 — Referral Details */}
                        <div className="space-y-3">
                          <div className="font-body text-[11px] text-brand-gold uppercase tracking-wider font-semibold mb-2">Referral Details</div>
                          {isEditing ? (
                            <>
                              <div>
                                <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase">Est. Import Value</label>
                                <input className={inputClass} value={editData.estimatedImportValue || ""} onChange={(e) => setEditData({ ...editData, estimatedImportValue: e.target.value })} />
                              </div>
                              <div>
                                <label className="font-body text-[10px] text-[var(--app-text-muted)] uppercase">TMS Reference</label>
                                <input className={inputClass} value={editData.tmsReference || ""} onChange={(e) => setEditData({ ...editData, tmsReference: e.target.value })} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Est. Import Value</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.estimatedImportValue ? `$${Number(r.estimatedImportValue).toLocaleString()}` : "—"}</span></div>
                              <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">TMS Reference</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.tmsReference || "—"}</span></div>
                            </>
                          )}
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">HTS Codes</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.htsCodes.length > 0 ? r.htsCodes.join(", ") : "—"}</span></div>
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Entry Count</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.entryCount ?? "—"}</span></div>
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Import Date Range</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.importDateRange || "—"}</span></div>
                        </div>

                        {/* Column 3 — Partner + Meta */}
                        <div className="space-y-3">
                          <div className="font-body text-[11px] text-brand-gold uppercase tracking-wider font-semibold mb-2">Partner & Meta</div>
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Partner</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.partner.firstName} {r.partner.lastName} ({r.partner.partnerCode})</span></div>
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Platform</span><span className="font-body text-[13px] text-[var(--app-text)] capitalize">{r.widgetSession.platform}</span></div>
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Deal Match</span><span className="font-body text-[13px] text-[var(--app-text)]">{r.referralId || "No match"}</span></div>
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Submission ID</span><span className="font-mono text-[11px] text-[var(--app-text-muted)]">{r.id}</span></div>
                          <div><span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Submitted</span><span className="font-body text-[13px] text-[var(--app-text)]">{new Date(r.createdAt).toLocaleString()}</span></div>

                          {/* Notes */}
                          <div>
                            <span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase block">Notes</span>
                            {isEditing ? (
                              <textarea className={inputClass + " h-20 resize-none"} value={editData.notes || ""} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} placeholder="Add notes..." />
                            ) : (
                              <span className="font-body text-[13px] text-[var(--app-text)]">{r.notes || "—"}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-4 pt-3 border-t border-[var(--app-border)] flex flex-wrap items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(r.id)}
                              disabled={saving}
                              className="btn-gold text-[12px] px-4 min-h-[36px] disabled:opacity-50"
                            >
                              {saving ? "Saving..." : "Save Changes"}
                            </button>
                            <button
                              onClick={() => { setEditId(null); setEditData({}); }}
                              className="font-body text-[12px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-4 min-h-[36px] hover:text-[var(--app-text-secondary)] transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                              className="font-body text-[12px] text-brand-gold border border-brand-gold/25 rounded-lg px-4 min-h-[36px] hover:bg-brand-gold/10 transition-colors"
                            >
                              Edit
                            </button>
                            {r.status !== "archived" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); updateStatus(r.id, "archived"); }}
                                className="font-body text-[12px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-4 min-h-[36px] hover:text-yellow-400 hover:border-yellow-500/25 transition-colors"
                              >
                                Archive
                              </button>
                            )}
                            {r.status === "archived" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); updateStatus(r.id, "submitted"); }}
                                className="font-body text-[12px] text-blue-400 border border-blue-500/25 rounded-lg px-4 min-h-[36px] hover:bg-blue-500/10 transition-colors"
                              >
                                Restore
                              </button>
                            )}
                            {deleteConfirmId === r.id ? (
                              <div className="flex items-center gap-2">
                                <span className="font-body text-[12px] text-red-400">Delete permanently?</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteReferral(r.id); }}
                                  className="font-body text-[11px] text-red-400 border border-red-500/25 rounded-lg px-3 min-h-[32px] hover:bg-red-500/10 transition-colors"
                                >
                                  Yes, Delete
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                  className="font-body text-[11px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-3 min-h-[32px] transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(r.id); }}
                                className="font-body text-[12px] text-red-400/70 border border-red-500/20 rounded-lg px-4 min-h-[36px] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
