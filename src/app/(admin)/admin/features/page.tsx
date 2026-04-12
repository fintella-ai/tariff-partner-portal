"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string | null;
  adminNotes: string | null;
  submittedBy: string;
  submittedByType: string;
  submittedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  submitted: number;
  in_review: number;
  in_progress: number;
  completed: number;
  rejected: number;
}

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted", color: "blue" },
  { value: "in_review", label: "In Review", color: "purple" },
  { value: "in_progress", label: "In Progress", color: "yellow" },
  { value: "completed", label: "Completed", color: "green" },
  { value: "rejected", label: "Not Planned", color: "red" },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  submitted: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", label: "Submitted" },
  in_review: { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400", label: "In Review" },
  in_progress: { bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-400", label: "In Progress" },
  completed: { bg: "bg-green-500/10 border-green-500/20", text: "text-green-400", label: "Completed" },
  rejected: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", label: "Not Planned" },
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "text-[var(--app-text-muted)]",
  normal: "text-blue-400",
  high: "text-yellow-400",
  urgent: "text-red-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  feature: "New Feature",
  ui: "UI / UX",
  bug: "Bug Report",
  integration: "Integration",
  other: "Other",
};

export default function AdminFeaturesPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const role = (session?.user as any)?.role;
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, submitted: 0, in_review: 0, in_progress: 0, completed: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/feature-requests${filter !== "all" ? `?status=${filter}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
        setStats(data.stats || stats);
      }
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadRequests(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  async function updateRequest(id: string, updates: { status?: string; priority?: string; adminNotes?: string }) {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/feature-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        loadRequests();
      }
    } catch {}
    finally { setSaving(null); }
  }

  async function deleteRequest(id: string) {
    if (!confirm("Permanently delete this feature request? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/feature-requests/${id}`, { method: "DELETE" });
      if (res.ok) {
        setExpandedId(null);
        loadRequests();
      }
    } catch {}
  }

  if (role && role !== "super_admin") {
    return (
      <div className="max-w-xl mx-auto bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="font-display text-xl font-bold mb-2">Super Admin Only</h2>
        <p className="font-body text-[13px] text-[var(--app-text-muted)]">
          Feature request management is restricted to super administrators.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase mb-1">
          Product Management
        </div>
        <h1 className={`font-display ${device.isMobile ? "text-2xl" : "text-3xl"} font-bold mb-1`}>
          Feature Requests
        </h1>
        <p className="font-body text-[12px] text-[var(--app-text-muted)]">
          Review and manage feedback from partners and admins.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total", value: stats.total, color: "text-brand-gold" },
          { label: "New", value: stats.submitted, color: "text-blue-400" },
          { label: "In Review", value: stats.in_review, color: "text-purple-400" },
          { label: "In Progress", value: stats.in_progress, color: "text-yellow-400" },
          { label: "Completed", value: stats.completed, color: "text-green-400" },
          { label: "Not Planned", value: stats.rejected, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg p-3">
            <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[{ value: "all", label: "All" }, ...STATUS_OPTIONS].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2 whitespace-nowrap transition-all min-h-[36px] ${
              filter === opt.value
                ? "bg-brand-gold/15 border-brand-gold/30 text-brand-gold"
                : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">Loading...</div>
      ) : requests.length === 0 ? (
        <div className="bg-[var(--app-card-bg)] border border-dashed border-[var(--app-border)] rounded-xl p-10 text-center">
          <div className="text-4xl mb-2">📭</div>
          <div className="font-body text-sm text-[var(--app-text-secondary)]">No feature requests match this filter.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((req) => {
            const statusStyle = STATUS_STYLES[req.status] || STATUS_STYLES.submitted;
            const isExpanded = expandedId === req.id;
            const currentNotes = editingNotes[req.id] ?? req.adminNotes ?? "";
            return (
              <div key={req.id} className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl overflow-hidden">
                {/* Card Header (clickable) */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  className="w-full text-left p-4 hover:bg-[var(--app-input-bg)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[14px] font-semibold text-[var(--app-text)] mb-1">{req.title}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-body text-[10px] ${statusStyle.bg} border ${statusStyle.text} rounded-full px-2 py-0.5`}>
                          {statusStyle.label}
                        </span>
                        {req.category && (
                          <span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">
                            {CATEGORY_LABELS[req.category] || req.category}
                          </span>
                        )}
                        <span className={`font-body text-[10px] uppercase tracking-wider ${PRIORITY_STYLES[req.priority] || ""}`}>
                          · {req.priority}
                        </span>
                        <span className="font-body text-[10px] text-[var(--app-text-muted)]">
                          · {req.submittedByType === "partner" ? "👤" : "🛡️"} {req.submittedByName || req.submittedBy}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] whitespace-nowrap">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </div>
                      <svg className={`w-4 h-4 text-[var(--app-text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[var(--app-border)]">
                    <div className="pt-4 mb-4">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">Description</div>
                      <div className="font-body text-[13px] text-[var(--app-text-secondary)] whitespace-pre-wrap leading-relaxed">{req.description}</div>
                    </div>

                    {/* Status + Priority Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="block font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">Status</label>
                        <select
                          value={req.status}
                          onChange={(e) => updateRequest(req.id, { status: e.target.value })}
                          disabled={saving === req.id}
                          className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/30"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">Priority</label>
                        <select
                          value={req.priority}
                          onChange={(e) => updateRequest(req.id, { priority: e.target.value })}
                          disabled={saving === req.id}
                          className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/30"
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>

                    {/* Admin Notes */}
                    <div className="mb-4">
                      <label className="block font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">Admin Response / Notes</label>
                      <textarea
                        value={currentNotes}
                        onChange={(e) => setEditingNotes({ ...editingNotes, [req.id]: e.target.value })}
                        placeholder="Add a note visible to the requester..."
                        rows={3}
                        className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2 font-body text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/30 resize-y"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => updateRequest(req.id, { adminNotes: currentNotes })}
                          disabled={saving === req.id || currentNotes === (req.adminNotes || "")}
                          className="bg-brand-gold/20 border border-brand-gold/30 text-brand-gold rounded-lg px-4 py-2 font-body text-[12px] font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50 min-h-[36px]"
                        >
                          {saving === req.id ? "Saving..." : "Save Note"}
                        </button>
                        <button
                          onClick={() => deleteRequest(req.id)}
                          className="border border-red-500/30 text-red-400 rounded-lg px-4 py-2 font-body text-[12px] font-semibold hover:bg-red-500/10 transition-colors min-h-[36px]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="font-body text-[10px] text-[var(--app-text-muted)] flex gap-4 flex-wrap pt-3 border-t border-[var(--app-border)]">
                      <span>ID: {req.id.substring(0, 12)}</span>
                      <span>Submitted: {new Date(req.createdAt).toLocaleString()}</span>
                      <span>Updated: {new Date(req.updatedAt).toLocaleString()}</span>
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
