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

type TabId = "all" | "new" | "contacted" | "qualified" | "approved" | "rejected";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contacted: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  qualified: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function AdminApplicationsPage() {
  const [tab, setTab] = useState<TabId>("all");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

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

  async function approveApplication(app: Application) {
    if (!confirm(`Approve ${app.firstName} ${app.lastName} as a 20% L2 partner under ${app.uplineCode}?\n\nThis creates a recruitment invite and emails the activation link to ${app.email}.`)) return;
    const res = await fetch(`/api/admin/applications/${app.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (res.ok) {
      flash("ok", `Approved — invite sent to ${app.email}`);
      fetchApps();
    } else {
      flash("err", data.error || "Approval failed");
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
            Leads from the public landing page. Review → qualification call → approve → auto-sends invite.
          </p>
        </div>
        <div className="flex gap-2">
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

      {loading ? (
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
                        {app.status}
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
                    onApprove={approveApplication}
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
        {app.status !== "contacted" && (
          <button onClick={() => onUpdateStatus(app.id, "contacted")} className="px-3 py-1.5 text-xs rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">
            Mark Contacted
          </button>
        )}
        {app.status !== "qualified" && (
          <button onClick={() => onUpdateStatus(app.id, "qualified")} className="px-3 py-1.5 text-xs rounded-md border border-[var(--app-border)] hover:bg-[var(--app-input-bg)]">
            Mark Qualified
          </button>
        )}
        {app.status !== "approved" && (
          <button onClick={() => onApprove(app)} className="px-3 py-1.5 text-xs rounded-md bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 font-semibold">
            ✓ Approve & Send Invite
          </button>
        )}
        {app.status !== "rejected" && (
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
