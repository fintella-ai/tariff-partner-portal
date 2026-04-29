"use client";

import { useState, useEffect, useCallback } from "react";
import { fmtDate, fmtDateTime } from "@/lib/format";

type Lead = {
  id: string; firstName: string; lastName: string; email: string; phone: string | null;
  commissionRate: number; tier: string; referredByCode: string | null; notes: string | null;
  status: string; inviteId: string | null; createdAt: string; updatedAt: string;
};

type Stage = "all" | "new" | "contacted" | "call_booked" | "qualified" | "submitted" | "converted" | "lost";

const STAGES: { id: Stage; label: string; color: string }[] = [
  { id: "all", label: "All", color: "text-[var(--app-text)]" },
  { id: "new", label: "New", color: "text-blue-400" },
  { id: "contacted", label: "Contacted", color: "text-purple-400" },
  { id: "call_booked", label: "Call Booked", color: "text-cyan-400" },
  { id: "qualified", label: "Qualified", color: "text-yellow-400" },
  { id: "submitted", label: "Submitted", color: "text-brand-gold" },
  { id: "converted", label: "Converted", color: "text-green-400" },
  { id: "lost", label: "Lost", color: "text-red-400" },
];

const STAGE_BADGES: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contacted: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  call_booked: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  qualified: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  submitted: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
  converted: "bg-green-500/10 text-green-400 border-green-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
  prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  invited: "bg-green-500/10 text-green-400 border-green-500/20",
  signed_up: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  skipped: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function InternalLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  function flash(tone: "ok" | "err", msg: string) {
    setBanner({ tone, msg });
    setTimeout(() => setBanner(null), 4000);
  }

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/leads");
      if (res.ok) {
        const data = await res.json();
        // Only show leads without a referredByCode (internal/direct leads)
        setLeads((data.leads ?? []).filter((l: Lead) => !l.referredByCode));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function updateLead(id: string, updates: Record<string, any>) {
    const res = await fetch(`/api/admin/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) { fetchLeads(); flash("ok", "Lead updated"); }
    else flash("err", "Failed to update");
    setEditingId(null);
  }

  async function sendInvite(id: string) {
    const res = await fetch(`/api/admin/leads/${id}/invite`, { method: "POST" });
    if (res.ok) { fetchLeads(); flash("ok", "Invite sent!"); }
    else {
      const data = await res.json().catch(() => ({ error: "Failed" }));
      flash("err", data.error || "Failed to send invite");
    }
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    const res = await fetch(`/api/admin/leads/${id}`, { method: "DELETE" });
    if (res.ok) { fetchLeads(); flash("ok", "Lead removed"); }
  }

  const q = search.toLowerCase().trim();
  const filtered = leads
    .filter((l) => stage === "all" || l.status === stage)
    .filter((l) => !q || `${l.firstName} ${l.lastName} ${l.email} ${l.phone || ""} ${l.notes || ""}`.toLowerCase().includes(q));

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "prospect").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    qualified: leads.filter((l) => l.status === "qualified").length,
    invited: leads.filter((l) => l.status === "invited").length,
    converted: leads.filter((l) => l.status === "signed_up").length,
  };

  const conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Internal Lead Pipeline</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Direct leads from ads and outreach — your internal funnel before opening to partners.
          </p>
        </div>
      </div>

      {banner && (
        <div className={`p-3 rounded-lg border text-sm mb-4 ${banner.tone === "ok" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
          {banner.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-[var(--app-text)]">{stats.total}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Total</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-blue-400">{stats.new}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">New</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-purple-400">{stats.contacted}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Contacted</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-yellow-400">{stats.qualified}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Qualified</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-green-400">{stats.invited}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Invited</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-brand-gold">{conversionRate}%</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Conversion</div>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads..."
          className="flex-1 min-w-[200px] theme-input rounded-lg px-4 py-2.5 text-sm"
        />
        <div className="flex gap-1 overflow-x-auto">
          {STAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStage(s.id)}
              className={`font-body text-[11px] px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                stage === s.id ? "bg-brand-gold/15 text-brand-gold font-semibold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lead List */}
      {loading ? (
        <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">Loading leads...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-3">📊</div>
          <h3 className="text-lg font-semibold mb-1">No internal leads yet</h3>
          <p className="text-sm text-[var(--app-text-muted)]">
            Leads from /recover and direct outreach will appear here. Run your first ad to start testing the funnel.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => {
            const isExpanded = expandedId === lead.id;
            const isEditing = editingId === lead.id;
            const source = (lead.notes || "").includes("/recover") ? "🌐 Website" : (lead.notes || "").includes("Direct") ? "📞 Direct" : "📋 Manual";
            const dutyMatch = (lead.notes || "").match(/Est\. duties: \$([\d,]+)/);
            const refundMatch = (lead.notes || "").match(/Est\. refund: \$([\d,]+)/);

            return (
              <div key={lead.id} className="card overflow-hidden">
                <div
                  className="px-5 py-4 cursor-pointer hover:bg-[var(--app-input-bg)] transition"
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-brand-gold/20 text-brand-gold flex items-center justify-center font-bold text-sm">
                        {lead.firstName[0]}{lead.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{lead.firstName} {lead.lastName}</div>
                        <div className="text-[12px] text-[var(--app-text-muted)] truncate">{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--app-text-faint)]">{source}</span>
                      {dutyMatch && <span className="text-[11px] text-yellow-400 font-semibold">${dutyMatch[1]}</span>}
                      <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase border ${STAGE_BADGES[lead.status] || STAGE_BADGES.new}`}>
                        {lead.status === "signed_up" ? "Converted" : lead.status}
                      </span>
                      <span className="text-[11px] text-[var(--app-text-faint)]">{fmtDate(lead.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-[var(--app-border)] pt-4">
                    {/* Details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-[12px]">
                      <div><span className="text-[var(--app-text-muted)]">Rate:</span> {Math.round(lead.commissionRate * 100)}%</div>
                      <div><span className="text-[var(--app-text-muted)]">Tier:</span> {lead.tier.toUpperCase()}</div>
                      {dutyMatch && <div><span className="text-[var(--app-text-muted)]">Est. Duties:</span> ${dutyMatch[1]}</div>}
                      {refundMatch && <div><span className="text-[var(--app-text-muted)]">Est. Refund:</span> ${refundMatch[1]}</div>}
                    </div>
                    {lead.notes && (
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-4 whitespace-pre-wrap bg-[var(--app-input-bg)] rounded-lg p-3">{lead.notes}</div>
                    )}

                    {/* Edit mode */}
                    {isEditing ? (
                      <div className="flex gap-2 flex-wrap mb-3">
                        <select value={editStage} onChange={(e) => setEditStage(e.target.value)} className="theme-input rounded-lg px-3 py-2 text-sm">
                          <option value="prospect">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="call_booked">Call Booked</option>
                          <option value="qualified">Qualified</option>
                          <option value="skipped">Lost</option>
                        </select>
                        <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="flex-1 theme-input rounded-lg px-3 py-2 text-sm" placeholder="Add note..." />
                        <button onClick={() => updateLead(lead.id, { status: editStage, notes: editNotes || lead.notes })} className="font-body text-[12px] px-4 py-2 rounded-lg bg-brand-gold/20 text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/30 transition">Save</button>
                        <button onClick={() => setEditingId(null)} className="font-body text-[11px] px-3 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)]">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => { setEditingId(lead.id); setEditStage(lead.status); setEditNotes(lead.notes || ""); }}
                          className="font-body text-[11px] px-3 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)] transition"
                        >
                          ✏️ Update Stage
                        </button>
                        {lead.status === "prospect" && (
                          <button
                            onClick={() => updateLead(lead.id, { status: "contacted" })}
                            className="font-body text-[11px] px-3 py-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition"
                          >
                            Mark Contacted
                          </button>
                        )}
                        {(lead.status === "prospect" || lead.status === "contacted") && (
                          <button
                            onClick={() => updateLead(lead.id, { status: "qualified" })}
                            className="font-body text-[11px] px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition"
                          >
                            Mark Qualified
                          </button>
                        )}
                        {lead.status !== "invited" && lead.status !== "signed_up" && (
                          <button
                            onClick={() => sendInvite(lead.id)}
                            className="font-body text-[11px] px-3 py-2 rounded-lg bg-brand-gold/20 text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/30 transition"
                          >
                            Send Partner Invite
                          </button>
                        )}
                        <button
                          onClick={() => deleteLead(lead.id)}
                          className="font-body text-[11px] px-3 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                        >
                          Delete
                        </button>
                      </div>
                    )}
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
