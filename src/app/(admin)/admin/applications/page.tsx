"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime, fmtPhone } from "@/lib/format";

type BookingWithSlot = {
  id: string;
  status: string;
  createdAt: string;
  slot: {
    id: string;
    startsAt: string;
    endsAt: string;
    title: string;
    location: string;
  };
};

type Application = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  website: string | null;
  audienceContext: string | null;
  referralSource: string | null;
  status: string;
  uplineCode: string;
  adminNotes: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  inviteId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  createdAt: string;
  updatedAt: string;
  bookings: BookingWithSlot[];
};

type TabId = "all" | "new" | "meeting_booked" | "no_show" | "approved" | "rejected" | "leads";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "meeting_booked", label: "Meeting Booked" },
  { id: "no_show", label: "No Show" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "leads", label: "Lead List" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  meeting_booked: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  no_show: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function AdminApplicationsPage() {
  const [tab, setTab] = useState<TabId>("all");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [approveApp, setApproveApp] = useState<Application | null>(null);
  const [approveRate, setApproveRate] = useState<number | "">("");
  const [approveCustomRate, setApproveCustomRate] = useState("");
  const [approveRateMode, setApproveRateMode] = useState<"preset" | "custom">("preset");
  const [approveReferrer, setApproveReferrer] = useState("");
  const [approveSending, setApproveSending] = useState(false);
  const [partnerList, setPartnerList] = useState<Array<{ partnerCode: string; firstName: string; lastName: string }>>([]);

  // Lead list state
  type Lead = { id: string; firstName: string; lastName: string; email: string; phone: string | null; commissionRate: number; tier: string; referredByCode: string | null; notes: string | null; status: string; inviteId: string | null; createdAt: string };
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadForm, setLeadForm] = useState({ firstName: "", lastName: "", email: "", phone: "", commissionRate: 0.25, tier: "l1", referredByCode: "", notes: "" });
  const [leadSaving, setLeadSaving] = useState(false);
  const [invitingLeadId, setInvitingLeadId] = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const qs = tab === "all" ? "" : `?status=${tab}`;
      const res = await fetch(`/api/admin/applications${qs}`);
      const data = await res.json();
      setApplications(data.applications ?? []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const res = await fetch("/api/admin/leads");
      if (res.ok) { const data = await res.json(); setLeads(data.leads ?? []); }
    } finally { setLeadsLoading(false); }
  }, []);

  useEffect(() => { if (tab === "leads") fetchLeads(); }, [tab, fetchLeads]);

  async function addLead() {
    if (!leadForm.firstName.trim() || !leadForm.lastName.trim() || !leadForm.email.trim()) return;
    setLeadSaving(true);
    try {
      const res = await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadForm),
      });
      if (res.ok) {
        setLeadForm({ firstName: "", lastName: "", email: "", phone: "", commissionRate: 0.25, tier: "l1", referredByCode: "", notes: "" });
        fetchLeads();
        flash("ok", "Lead added to prospect list");
      } else {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        flash("err", error);
      }
    } finally { setLeadSaving(false); }
  }

  async function inviteLead(leadId: string) {
    setInvitingLeadId(leadId);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/invite`, { method: "POST" });
      if (res.ok) {
        flash("ok", "Invite sent!");
        fetchLeads();
      } else {
        const { error } = await res.json().catch(() => ({ error: "Failed to send invite" }));
        flash("err", error);
      }
    } finally { setInvitingLeadId(null); }
  }

  async function deleteLead(leadId: string) {
    const res = await fetch(`/api/admin/leads/${leadId}`, { method: "DELETE" });
    if (res.ok) { flash("ok", "Lead removed"); fetchLeads(); }
  }

  async function skipLead(leadId: string) {
    const res = await fetch(`/api/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "skipped" }),
    });
    if (res.ok) fetchLeads();
  }

  function flash(tone: "ok" | "err", msg: string) {
    setBanner({ tone, msg });
    setTimeout(() => setBanner(null), 4000);
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      flash("ok", `Status updated to "${status}"`);
      fetchApps();
    } else {
      const { error } = await res.json().catch(() => ({ error: "Update failed" }));
      flash("err", error);
    }
  }

  async function saveNotes(id: string, adminNotes: string) {
    const res = await fetch(`/api/admin/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNotes }),
    });
    if (res.ok) {
      flash("ok", "Notes saved");
      fetchApps();
    } else {
      flash("err", "Notes save failed");
    }
  }

  function startApprove(app: Application) {
    setApproveApp(app);
    setApproveRate("");
    setApproveCustomRate("");
    setApproveRateMode("preset");
    setApproveReferrer(app.uplineCode || "");
    if (partnerList.length === 0) {
      fetch("/api/admin/partners")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d?.partners) setPartnerList(d.partners.map((p: any) => ({ partnerCode: p.partnerCode, firstName: p.firstName, lastName: p.lastName })));
        })
        .catch(() => {});
    }
  }

  async function submitApproval() {
    if (!approveApp) return;
    setApproveSending(true);
    try {
      const res = await fetch(`/api/admin/applications/${approveApp.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionRate: approveRateMode === "custom" ? parseFloat(approveCustomRate) / 100 : approveRate, uplineCode: approveReferrer || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        flash("ok", `Approved — invite sent to ${approveApp.email}`);
        setApproveApp(null);
        fetchApps();
      } else {
        flash("err", data.error || "Approval failed");
      }
    } finally {
      setApproveSending(false);
    }
  }

  async function rejectApplication(app: Application) {
    const reason = prompt(`Reject ${app.firstName} ${app.lastName}?\n\nOptional reason (for internal records):`);
    if (reason === null) return;
    const res = await fetch(`/api/admin/applications/${app.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      flash("ok", "Application marked as rejected");
      fetchApps();
    } else {
      flash("err", "Rejection failed");
    }
  }

  async function deleteApplication(app: Application) {
    if (!confirm(`Permanently delete ${app.firstName} ${app.lastName}'s application?\n\nThis cannot be undone.`)) return;
    const res = await fetch(`/api/admin/applications/${app.id}`, { method: "DELETE" });
    if (res.ok) {
      flash("ok", "Application deleted");
      setExpandedId(null);
      fetchApps();
    } else {
      flash("err", "Delete failed");
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 text-left">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Partner Applications</h1>
          <p className="text-sm text-[var(--app-text-muted)] mt-1">
            Leads from the public landing page. New → Meeting Booked → Approve → auto-sends invite.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              navigator.clipboard.writeText("https://fintella.partners");
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)] transition"
          >
            {copied ? "✓ Copied!" : "🔗 Copy Landing Link"}
          </button>
          <button
            onClick={() => setShowInviteForm((v) => !v)}
            className={`px-4 py-2 rounded-lg border text-sm transition ${
              showInviteForm
                ? "border-[var(--brand-gold)] bg-[var(--brand-gold)]/10 text-[var(--brand-gold)]"
                : "border-[var(--app-border)] hover:bg-[var(--app-input-bg)]"
            }`}
          >
            ✉️ Email Invite
          </button>
          <Link
            href="/admin/booking-slots"
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)] transition"
          >
            📅 Manage Booking Slots
          </Link>
          <button
            onClick={fetchApps}
            className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90"
          >
            Refresh
          </button>
        </div>
      </div>

      {showInviteForm && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Email Landing Page Invite</h3>
            <button
              onClick={() => { setShowInviteForm(false); setInviteEmail(""); setInviteName(""); }}
              className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="partner@example.com"
                className="w-full theme-input rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">
                Name <span className="text-[var(--app-text-muted)]">(optional)</span>
              </label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="First Last"
                className="w-full theme-input rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!inviteEmail || inviteSending}
              onClick={async () => {
                setInviteSending(true);
                try {
                  const res = await fetch("/api/admin/landing-invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: inviteEmail, name: inviteName || undefined }),
                  });
                  if (res.ok) {
                    flash("ok", `Landing invite sent to ${inviteEmail}`);
                    setInviteEmail("");
                    setInviteName("");
                    setShowInviteForm(false);
                  } else {
                    const data = await res.json().catch(() => ({ error: "Send failed" }));
                    flash("err", data.error || "Send failed");
                  }
                } catch {
                  flash("err", "Network error — could not send invite");
                } finally {
                  setInviteSending(false);
                }
              }}
              className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviteSending ? "Sending…" : "Send Landing Invite"}
            </button>
            <button
              onClick={() => { setShowInviteForm(false); setInviteEmail(""); setInviteName(""); }}
              className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {banner && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            banner.tone === "ok"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {approveApp && (
        <div className="card p-5 space-y-4 border-green-500/30 bg-green-500/[0.03]">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-green-400">Approve & Send Invite</h3>
            <button onClick={() => setApproveApp(null)} className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]">Cancel</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Name</label>
              <div className="text-sm font-medium">{approveApp.firstName} {approveApp.lastName}</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Email</label>
              <div className="text-sm font-medium">{approveApp.email}</div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Commission Rate</label>
              {approveRateMode === "preset" ? (
                <div className="flex gap-2">
                  <select
                    value={approveRate}
                    onChange={(e) => {
                      if (e.target.value === "__custom") { setApproveRateMode("custom"); setApproveRate(""); return; }
                      setApproveRate(e.target.value ? parseFloat(e.target.value) : "");
                    }}
                    className={`flex-1 theme-input rounded-lg px-3 py-2 text-sm ${approveRate === "" ? "border-red-500/40" : ""}`}
                  >
                    <option value="">— Select rate —</option>
                    <option value={0.05}>5%</option>
                    <option value={0.10}>10%</option>
                    <option value={0.15}>15%</option>
                    <option value={0.20}>20%</option>
                    <option value={0.25}>25%</option>
                    <option value={0.30}>30%</option>
                    <option value="__custom">Custom…</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    value={approveCustomRate}
                    onChange={(e) => setApproveCustomRate(e.target.value)}
                    placeholder="e.g. 12"
                    className="w-24 theme-input rounded-lg px-3 py-2 text-sm"
                  />
                  <span className="text-sm theme-text-muted">%</span>
                  <button
                    onClick={() => { setApproveRateMode("preset"); setApproveCustomRate(""); }}
                    className="text-xs text-brand-gold hover:underline"
                  >
                    Back to presets
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Referred By</label>
              <select
                value={approveReferrer}
                onChange={(e) => setApproveReferrer(e.target.value)}
                className="w-full theme-input rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— None (direct) —</option>
                {partnerList.map((p) => (
                  <option key={p.partnerCode} value={p.partnerCode}>
                    {p.firstName} {p.lastName} ({p.partnerCode})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={approveSending || (approveRateMode === "preset" ? approveRate === "" : !approveCustomRate || parseFloat(approveCustomRate) <= 0 || parseFloat(approveCustomRate) > 30)}
              onClick={submitApproval}
              className="px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-50"
            >
              {approveSending ? "Sending…" : `Approve & Send Invite to ${approveApp.email}`}
            </button>
            <button onClick={() => setApproveApp(null)} className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)]">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-[var(--app-border)] overflow-x-auto">
        {TABS.map((t) => {
          const count =
            t.id === "all"
              ? applications.length
              : applications.filter((a) => a.status === t.id).length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                tab === t.id
                  ? "border-[var(--brand-gold)] text-[var(--app-text)]"
                  : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
              }`}
            >
              {t.label}
              {tab === t.id && count > 0 && (
                <span className="ml-2 text-xs opacity-75">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "leads" ? (
        <div className="space-y-4">
          {/* Add Lead Form */}
          <div className="card p-5">
            <h3 className="font-body font-semibold text-sm mb-3">Add to Prospect List</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">First Name *</label>
                <input value={leadForm.firstName} onChange={(e) => setLeadForm((f) => ({ ...f, firstName: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Jane" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Last Name *</label>
                <input value={leadForm.lastName} onChange={(e) => setLeadForm((f) => ({ ...f, lastName: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Doe" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Email *</label>
                <input type="email" value={leadForm.email} onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="jane@example.com" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Phone</label>
                <input value={leadForm.phone} onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="(555) 123-4567" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Rate</label>
                <select value={leadForm.commissionRate} onChange={(e) => setLeadForm((f) => ({ ...f, commissionRate: parseFloat(e.target.value) }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm">
                  <option value={0.10}>10%</option>
                  <option value={0.15}>15%</option>
                  <option value={0.20}>20%</option>
                  <option value={0.25}>25%</option>
                  <option value={0.30}>30%</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Level</label>
                <select value={leadForm.tier} onChange={(e) => setLeadForm((f) => ({ ...f, tier: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm">
                  <option value="l1">L1 — House Account</option>
                  <option value="l2">L2</option>
                  <option value="l3">L3</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Referred By (partner code)</label>
                <input value={leadForm.referredByCode} onChange={(e) => setLeadForm((f) => ({ ...f, referredByCode: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Optional — leave blank for house accounts" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] mb-1 block">Notes</label>
                <input value={leadForm.notes} onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value }))} className="w-full theme-input rounded-lg px-3 py-2 text-sm" placeholder="Optional notes" />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={addLead} disabled={leadSaving || !leadForm.firstName.trim() || !leadForm.lastName.trim() || !leadForm.email.trim()} className="px-5 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {leadSaving ? "Saving…" : "+ Add to List"}
              </button>
            </div>
          </div>

          {/* Lead Table */}
          {leadsLoading ? (
            <div className="text-center text-[var(--app-text-muted)] py-12">Loading leads…</div>
          ) : leads.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="text-5xl mb-3">📋</div>
              <h3 className="text-lg font-semibold mb-1">No prospects yet</h3>
              <p className="text-sm text-[var(--app-text-muted)]">Add potential partners above. When you&apos;re ready, click &quot;Send Invite&quot; to bring them in.</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <div className="grid grid-cols-[2fr_1fr_0.6fr_0.6fr_0.8fr_auto] gap-3 px-5 py-3 border-b border-[var(--app-border)] items-center">
                {["Name / Email", "Phone", "Rate", "Level", "Status", ""].map((h) => (
                  <div key={h} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">{h}</div>
                ))}
              </div>
              {leads.map((lead) => {
                const isInviting = invitingLeadId === lead.id;
                return (
                  <div key={lead.id} className="grid grid-cols-[2fr_1fr_0.6fr_0.6fr_0.8fr_auto] gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center">
                    <div>
                      <div className="font-body text-[13px] text-[var(--app-text)] font-medium">{lead.firstName} {lead.lastName}</div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)]">{lead.email}</div>
                      {lead.notes && <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-0.5 truncate">{lead.notes}</div>}
                    </div>
                    <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{lead.phone || "—"}</div>
                    <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{Math.round(lead.commissionRate * 100)}%</div>
                    <div className="font-body text-[12px] text-[var(--app-text-secondary)] uppercase">{lead.tier}</div>
                    <div>
                      <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase border ${
                        lead.status === "prospect" ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : lead.status === "invited" ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : lead.status === "signed_up" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                      }`}>
                        {lead.status === "signed_up" ? "signed up" : lead.status}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {lead.status === "prospect" && (
                        <>
                          <button
                            onClick={() => inviteLead(lead.id)}
                            disabled={isInviting}
                            className="font-body text-[11px] px-3 min-h-[32px] rounded-lg border text-brand-gold border-brand-gold/30 hover:bg-brand-gold/10 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {isInviting ? "Sending…" : "Send Invite"}
                          </button>
                          <button
                            onClick={() => skipLead(lead.id)}
                            className="font-body text-[11px] px-2 min-h-[32px] rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-input-bg)] transition-colors"
                            title="Skip this lead"
                          >
                            Skip
                          </button>
                          <button
                            onClick={() => deleteLead(lead.id)}
                            className="font-body text-[11px] px-2 min-h-[32px] rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Remove lead"
                          >
                            ✕
                          </button>
                        </>
                      )}
                      {lead.status === "invited" && (
                        <span className="font-body text-[11px] text-green-400">✓ Invited</span>
                      )}
                      {lead.status === "skipped" && (
                        <button
                          onClick={() => {
                            fetch(`/api/admin/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "prospect" }) })
                              .then(() => fetchLeads());
                          }}
                          className="font-body text-[11px] px-3 min-h-[32px] rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-input-bg)] transition-colors"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="text-center text-[var(--app-text-muted)] py-12">Loading applications…</div>
      ) : applications.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-3">📭</div>
          <h3 className="text-lg font-semibold mb-1">No applications yet</h3>
          <p className="text-sm text-[var(--app-text-muted)]">
            Once someone submits the public landing page form, they'll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const isExpanded = expandedId === app.id;
            const booking = app.bookings[0];
            const statusColor = STATUS_COLORS[app.status] || STATUS_COLORS.new;
            return (
              <div key={app.id} className="card overflow-hidden">
                <div
                  className="px-5 py-4 cursor-pointer hover:bg-[var(--app-input-bg)] transition"
                  onClick={() => setExpandedId(isExpanded ? null : app.id)}
                >
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[var(--brand-gold)]/20 text-[var(--brand-gold)] flex items-center justify-center font-bold">
                        {app.firstName[0]}{app.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {app.firstName} {app.lastName}
                          {app.companyName && (
                            <span className="text-[var(--app-text-muted)] font-normal">
                              {" "}· {app.companyName}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-[var(--app-text-muted)] truncate">
                          {app.email}{app.phone ? ` · ${fmtPhone(app.phone)}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {booking && (
                        <div className="text-xs text-[var(--app-text-muted)] whitespace-nowrap">
                          📅 {fmtDateTime(booking.slot.startsAt)}
                        </div>
                      )}
                      <span
                        className={`px-2.5 py-1 text-xs rounded-full border ${statusColor}`}
                      >
                        {app.status.replace(/_/g, " ")}
                      </span>
                      <div className="text-xs text-[var(--app-text-muted)] whitespace-nowrap">
                        {fmtDate(app.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <ApplicationDetail
                    app={app}
                    onUpdateStatus={updateStatus}
                    onSaveNotes={saveNotes}
                    onApprove={startApprove}
                    onReject={rejectApplication}
                    onDelete={deleteApplication}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApplicationDetail({
  app,
  onUpdateStatus,
  onSaveNotes,
  onApprove,
  onReject,
  onDelete,
}: {
  app: Application;
  onUpdateStatus: (id: string, status: string) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onApprove: (app: Application) => void;
  onReject: (app: Application) => void;
  onDelete: (app: Application) => void;
}) {
  const [notes, setNotes] = useState(app.adminNotes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);
  const booking = app.bookings[0];

  return (
    <div className="border-t border-[var(--app-border)] p-5 space-y-5 bg-[var(--app-input-bg)]/50">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <Field label="Email" value={app.email} copy />
        <Field label="Phone" value={app.phone ? fmtPhone(app.phone) : "—"} />
        <Field label="Company" value={app.companyName ?? "—"} />
        <Field label="Website" value={app.website ? <a href={app.website} target="_blank" rel="noreferrer" className="text-[var(--brand-gold)] underline">{app.website}</a> : "—"} />
        <Field label="Heard about us via" value={app.referralSource ?? "—"} />
        <Field label="Submitted" value={fmtDateTime(app.createdAt)} />
        <Field label="Upline code" value={app.uplineCode} />
        <Field label="Status" value={app.status} />
      </div>

      {app.audienceContext && (
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1">
            Audience / Network
          </div>
          <div className="text-sm whitespace-pre-wrap p-3 rounded-lg bg-[var(--app-bg)] border border-[var(--app-border)]">
            {app.audienceContext}
          </div>
        </div>
      )}

      {booking && (
        <div className="p-3 rounded-lg bg-[var(--app-bg)] border border-[var(--app-border)]">
          <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1">
            📅 Booked qualification call
          </div>
          <div className="text-sm font-medium">{booking.slot.title}</div>
          <div className="text-sm text-[var(--app-text-muted)]">
            {fmtDateTime(booking.slot.startsAt)} — {fmtDateTime(booking.slot.endsAt)}
          </div>
          <div className="text-xs text-[var(--app-text-muted)] mt-1">
            Location: {booking.slot.location}
          </div>
        </div>
      )}

      {(app.utmSource || app.utmMedium || app.utmCampaign || app.utmContent) && (
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1">
            Tracking
          </div>
          <div className="text-xs text-[var(--app-text-muted)] space-x-3">
            {app.utmSource && <span>src={app.utmSource}</span>}
            {app.utmMedium && <span>med={app.utmMedium}</span>}
            {app.utmCampaign && <span>camp={app.utmCampaign}</span>}
            {app.utmContent && <span>ct={app.utmContent}</span>}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-1">
          Admin notes
        </div>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
          rows={3}
          className="w-full theme-input rounded-lg px-3 py-2 text-sm"
          placeholder="Internal notes — not visible to the applicant"
        />
        {notesDirty && (
          <button
            onClick={() => { onSaveNotes(app.id, notes); setNotesDirty(false); }}
            className="mt-2 px-3 py-1.5 text-xs rounded-md bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] font-semibold hover:opacity-90"
          >
            Save notes
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--app-border)]">
        {app.status === "new" && (
          <button onClick={() => onUpdateStatus(app.id, "meeting_booked")} className="px-3 py-1.5 text-xs rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 font-semibold">
            📅 Meeting Booked
          </button>
        )}
        {(app.status === "meeting_booked") && (
          <button onClick={() => onUpdateStatus(app.id, "no_show")} className="px-3 py-1.5 text-xs rounded-md border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 font-semibold">
            ⚠️ No Show
          </button>
        )}
        {app.status !== "approved" && app.status !== "rejected" && (
          <button onClick={() => onApprove(app)} className="px-3 py-1.5 text-xs rounded-md bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 font-semibold">
            ✓ Approve & Send Invite
          </button>
        )}
        {app.status !== "rejected" && app.status !== "approved" && (
          <button onClick={() => onReject(app)} className="px-3 py-1.5 text-xs rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
            ✗ Reject
          </button>
        )}
        <button onClick={() => onDelete(app)} className="px-3 py-1.5 text-xs rounded-md text-red-400 hover:bg-red-500/10 ml-auto">
          Delete
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, copy }: { label: string; value: React.ReactNode; copy?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)] mb-0.5">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div className="font-medium break-all">{value}</div>
        {copy && typeof value === "string" && (
          <button
            onClick={() => navigator.clipboard.writeText(value)}
            className="text-xs text-[var(--app-text-muted)] hover:text-[var(--brand-gold)]"
            title="Copy"
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}
