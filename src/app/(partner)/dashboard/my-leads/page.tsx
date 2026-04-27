"use client";

import { useState, useEffect, useCallback } from "react";
import { fmtDate } from "@/lib/format";

type Prospect = {
  id: string; companyName: string; contactName: string; contactEmail: string | null;
  contactPhone: string | null; industry: string | null; importVolume: string | null;
  productTypes: string | null; annualDuties: string | null; stage: string; score: number;
  source: string | null; notes: string | null; nextFollowUpAt: string | null;
  callBookedAt: string | null; submittedAt: string | null; lostReason: string | null;
  dealId: string | null; createdAt: string; updatedAt: string;
};

type Stats = { total: number; new: number; contacted: number; callBooked: number; qualified: number; submitted: number; won: number; lost: number };

const STAGES = ["new", "contacted", "call_booked", "qualified", "submitted", "won", "lost"] as const;
const STAGE_LABELS: Record<string, string> = { new: "New", contacted: "Contacted", call_booked: "Call Booked", qualified: "Qualified", submitted: "Submitted", won: "Won", lost: "Lost" };
const STAGE_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contacted: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  call_booked: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  qualified: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  submitted: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
  won: "bg-green-500/10 text-green-400 border-green-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
};

const VOLUME_OPTIONS = ["Under $100K", "$100K-$500K", "$500K-$1M", "$1M+"];
const SOURCE_OPTIONS = ["referral", "linkedin", "cold_outreach", "ai_screener", "website", "event", "other"];

export default function MyLeadsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, new: 0, contacted: 0, callBooked: 0, qualified: 0, submitted: 0, won: 0, lost: 0 });
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ imported: number; errors: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "", contactName: "", contactEmail: "", contactPhone: "",
    industry: "", importVolume: "", productTypes: "", annualDuties: "",
    source: "referral", notes: "",
  });

  const fetchProspects = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/prospects");
      if (res.ok) {
        const data = await res.json();
        setProspects(data.prospects ?? []);
        setStats(data.stats ?? stats);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  async function addProspect() {
    if (!form.companyName.trim() || !form.contactName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/partner/prospects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", industry: "", importVolume: "", productTypes: "", annualDuties: "", source: "referral", notes: "" });
        setShowForm(false);
        fetchProspects();
      }
    } finally { setSaving(false); }
  }

  async function moveStage(id: string, stage: string) {
    await fetch(`/api/partner/prospects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    fetchProspects();
  }

  async function deleteProspect(id: string) {
    await fetch(`/api/partner/prospects/${id}`, { method: "DELETE" });
    fetchProspects();
  }

  const filtered = stageFilter === "all" ? prospects : prospects.filter((p) => p.stage === stageFilter);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">My Leads</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Track your prospects from first contact to firm submission. Your personal sales pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulk((v) => !v)}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] text-sm hover:bg-[var(--app-input-bg)] transition"
          >
            📋 Bulk Import
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90"
          >
            + New Lead
          </button>
        </div>
      </div>

      {/* Bulk Import */}
      {showBulk && (
        <div className="card p-5 mb-6">
          <h3 className="font-body font-semibold text-sm mb-2">Bulk Import Leads</h3>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-3">
            Paste your client list — one per line. Format: <code className="text-[var(--app-text-secondary)]">Company Name, Contact Name, Email, Phone</code> (phone optional)
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full theme-input rounded-lg px-3 py-2 text-sm min-h-[120px] resize-y font-mono"
            placeholder={"Acme Imports, Jane Smith, jane@acme.com, 555-123-4567\nGlobal Trade Co, Bob Jones, bob@globaltrade.com\nPacific Freight, Sarah Lee, sarah@pacfreight.com, 555-987-6543"}
          />
          {bulkResult && (
            <div className={`mt-2 p-2 rounded-lg text-sm ${bulkResult.errors > 0 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
              Imported {bulkResult.imported} leads{bulkResult.errors > 0 ? `, ${bulkResult.errors} skipped (missing required fields)` : ""}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setShowBulk(false); setBulkText(""); setBulkResult(null); }} className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-muted)]">Cancel</button>
            <button
              disabled={bulkImporting || !bulkText.trim()}
              onClick={async () => {
                setBulkImporting(true);
                setBulkResult(null);
                const lines = bulkText.trim().split("\n").filter(Boolean);
                let imported = 0;
                let errors = 0;
                for (const line of lines) {
                  const parts = line.split(",").map((s) => s.trim());
                  const [companyName, contactName, contactEmail, contactPhone] = parts;
                  if (!companyName || !contactName) { errors++; continue; }
                  try {
                    const res = await fetch("/api/partner/prospects", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ companyName, contactName, contactEmail, contactPhone, source: "other" }),
                    });
                    if (res.ok) imported++; else errors++;
                  } catch { errors++; }
                }
                setBulkResult({ imported, errors });
                setBulkImporting(false);
                if (imported > 0) fetchProspects();
              }}
              className="px-5 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {bulkImporting ? "Importing..." : `Import ${bulkText.trim().split("\n").filter(Boolean).length} Leads`}
            </button>
          </div>
        </div>
      )}

      {/* Pipeline Stats */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-6">
        {[
          { key: "all", label: "Total", value: stats.total, color: "text-[var(--app-text)]" },
          { key: "new", label: "New", value: stats.new, color: "text-blue-400" },
          { key: "contacted", label: "Contacted", value: stats.contacted, color: "text-purple-400" },
          { key: "call_booked", label: "Call Set", value: stats.callBooked, color: "text-cyan-400" },
          { key: "qualified", label: "Qualified", value: stats.qualified, color: "text-yellow-400" },
          { key: "submitted", label: "Submitted", value: stats.submitted, color: "text-brand-gold" },
          { key: "won", label: "Won", value: stats.won, color: "text-green-400" },
          { key: "lost", label: "Lost", value: stats.lost, color: "text-red-400" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setStageFilter(s.key)}
            className={`card p-3 text-center transition-colors ${stageFilter === s.key ? "ring-1 ring-brand-gold/40" : ""}`}
          >
            <div className={`font-display text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Add Lead Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h3 className="font-body font-semibold text-sm mb-3">Add New Lead</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Company *</label>
              <input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Acme Imports LLC" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Contact Name *</label>
              <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Jane Smith" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Email</label>
              <input type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="jane@acme.com" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Phone</label>
              <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="(555) 123-4567" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Industry</label>
              <input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Manufacturing, Retail..." />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Annual Import Volume</label>
              <select value={form.importVolume} onChange={(e) => setForm((f) => ({ ...f, importVolume: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm">
                <option value="">Select...</option>
                {VOLUME_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">What They Import</label>
              <input value={form.productTypes} onChange={(e) => setForm((f) => ({ ...f, productTypes: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Electronics, textiles..." />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Lead Source</label>
              <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm">
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y" placeholder="Any context about this lead..." />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-muted)] hover:bg-[var(--app-input-bg)]">Cancel</button>
            <button onClick={addProspect} disabled={saving || !form.companyName.trim() || !form.contactName.trim()} className="px-5 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving..." : "Add Lead"}
            </button>
          </div>
        </div>
      )}

      {/* Lead List */}
      {loading ? (
        <div className="text-center text-[var(--app-text-muted)] py-12 font-body text-sm">Loading your leads...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <h3 className="text-lg font-semibold mb-1">{stageFilter === "all" ? "No leads yet" : `No ${STAGE_LABELS[stageFilter] || stageFilter} leads`}</h3>
          <p className="text-sm text-[var(--app-text-muted)]">
            {stageFilter === "all" ? 'Click "+ New Lead" to start tracking your prospects.' : "Move leads through your pipeline to see them here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isExpanded = expandedId === p.id;
            const stageIdx = STAGES.indexOf(p.stage as typeof STAGES[number]);
            const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 2 ? STAGES[stageIdx + 1] : null;
            return (
              <div key={p.id} className="card overflow-hidden">
                <div className="px-5 py-4 cursor-pointer hover:bg-[var(--app-input-bg)] transition" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-brand-gold/20 text-brand-gold flex items-center justify-center font-bold text-sm">
                        {p.contactName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{p.companyName}</div>
                        <div className="text-[12px] text-[var(--app-text-muted)] truncate">{p.contactName}{p.contactEmail ? ` · ${p.contactEmail}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.score > 0 && (
                        <span className={`font-body text-[11px] font-bold ${p.score >= 70 ? "text-green-400" : p.score >= 40 ? "text-yellow-400" : "text-[var(--app-text-muted)]"}`}>
                          {p.score}pts
                        </span>
                      )}
                      <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase border ${STAGE_COLORS[p.stage] || STAGE_COLORS.new}`}>
                        {STAGE_LABELS[p.stage] || p.stage}
                      </span>
                      <span className="text-[var(--app-text-muted)] text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-[var(--app-border)] pt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-[12px]">
                      {p.industry && <div><span className="text-[var(--app-text-muted)]">Industry:</span> {p.industry}</div>}
                      {p.importVolume && <div><span className="text-[var(--app-text-muted)]">Volume:</span> {p.importVolume}</div>}
                      {p.productTypes && <div><span className="text-[var(--app-text-muted)]">Products:</span> {p.productTypes}</div>}
                      {p.source && <div><span className="text-[var(--app-text-muted)]">Source:</span> {p.source.replace("_", " ")}</div>}
                      {p.contactPhone && <div><span className="text-[var(--app-text-muted)]">Phone:</span> {p.contactPhone}</div>}
                      {p.nextFollowUpAt && <div><span className="text-[var(--app-text-muted)]">Follow up:</span> {fmtDate(p.nextFollowUpAt)}</div>}
                      {p.callBookedAt && <div><span className="text-[var(--app-text-muted)]">Call booked:</span> {fmtDate(p.callBookedAt)}</div>}
                      {p.submittedAt && <div><span className="text-[var(--app-text-muted)]">Submitted:</span> {fmtDate(p.submittedAt)}</div>}
                    </div>
                    {p.notes && <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-4 whitespace-pre-wrap bg-[var(--app-input-bg)] rounded-lg p-3">{p.notes}</div>}
                    {p.lostReason && <div className="font-body text-[12px] text-red-400 mb-4">Lost: {p.lostReason}</div>}
                    <div className="flex gap-2 flex-wrap">
                      {nextStage && (
                        <button
                          onClick={() => moveStage(p.id, nextStage)}
                          className="font-body text-[12px] px-4 py-2 rounded-lg bg-brand-gold/20 text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/30 transition-colors font-medium"
                        >
                          Move to {STAGE_LABELS[nextStage]} →
                        </button>
                      )}
                      {p.stage === "qualified" && (
                        <a
                          href="/dashboard/submit-client"
                          className="font-body text-[12px] px-4 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors font-medium"
                        >
                          Submit to Firm ↗
                        </a>
                      )}
                      {p.stage !== "lost" && p.stage !== "won" && (
                        <button
                          onClick={() => moveStage(p.id, "lost")}
                          className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          Mark Lost
                        </button>
                      )}
                      <button
                        onClick={() => deleteProspect(p.id)}
                        className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-input-bg)] transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
