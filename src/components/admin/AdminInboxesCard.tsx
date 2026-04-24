"use client";

/**
 * Admin Inbox management card — rendered inside /admin/settings Integrations
 * tab. Phase 3c.3a of the PartnerOS AI roadmap.
 *
 * Shows the 4 seeded AdminInbox rows (support / legal / admin / accounting)
 * and lets a super_admin or admin:
 *   - add/remove assigned admins (who get bell notifications + emails later)
 *   - toggle "Accept Scheduled Calls" (gates the Phase 3c.4 booking tool)
 *   - edit the call duration + title template + timezone
 *
 * Google Calendar connect per inbox lives in Phase 3c.4 and is surfaced as
 * a read-only indicator here.
 */
import { useEffect, useState } from "react";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface Inbox {
  id: string;
  role: string;
  emailAddress: string;
  displayName: string;
  categories: string[];
  assignedAdminIds: string[];
  assignedAdmins: AdminUser[];
  acceptScheduledCalls: boolean;
  timeZone: string;
  callDurationMinutes: number;
  callTitleTemplate: string;
  googleCalendarConnectedAt: string | null;
  updatedAt: string;
}

export default function AdminInboxesCard() {
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [allAdmins, setAllAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [inboxesRes, usersRes] = await Promise.all([
        fetch("/api/admin/inboxes"),
        fetch("/api/admin/users").catch(() => null),
      ]);
      if (!inboxesRes.ok) throw new Error("Failed to load inboxes");
      const { inboxes: list } = await inboxesRes.json();
      setInboxes(list);
      if (usersRes?.ok) {
        const { users } = await usersRes.json();
        setAllAdmins(users);
      }
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveInbox(
    id: string,
    patch: Partial<
      Pick<
        Inbox,
        | "assignedAdminIds"
        | "acceptScheduledCalls"
        | "timeZone"
        | "callDurationMinutes"
        | "callTitleTemplate"
      >
    >
  ) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/inboxes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Save failed (${res.status})`);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="font-body text-[13px] text-[var(--app-text-muted)] p-4">
          Loading admin inboxes…
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="p-5 border-b border-[var(--app-border)]">
        <h3 className="font-display text-base font-semibold text-[var(--app-text)]">
          Admin Inboxes (PartnerOS)
        </h3>
        <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1">
          Assign admins to each role inbox. When Ollie (the AI support
          specialist) creates a ticket or books a call, the routed inbox&apos;s
          assigned admins get the bell notification.
        </p>
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-500/10 border-b border-red-500/20 font-body text-[12px] text-red-500">
          {error}
        </div>
      )}

      <div className="divide-y divide-[var(--app-border)]">
        {inboxes.map((inbox) => (
          <InboxRow
            key={inbox.id}
            inbox={inbox}
            allAdmins={allAdmins}
            saving={savingId === inbox.id}
            onSave={(patch) => saveInbox(inbox.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function InboxRow({
  inbox,
  allAdmins,
  saving,
  onSave,
}: {
  inbox: Inbox;
  allAdmins: AdminUser[];
  saving: boolean;
  onSave: (
    patch: Partial<
      Pick<
        Inbox,
        | "assignedAdminIds"
        | "acceptScheduledCalls"
        | "timeZone"
        | "callDurationMinutes"
        | "callTitleTemplate"
      >
    >
  ) => void;
}) {
  const [draftAssigned, setDraftAssigned] = useState<string[]>(
    inbox.assignedAdminIds
  );
  const [draftAccepts, setDraftAccepts] = useState<boolean>(
    inbox.acceptScheduledCalls
  );

  useEffect(() => {
    setDraftAssigned(inbox.assignedAdminIds);
    setDraftAccepts(inbox.acceptScheduledCalls);
  }, [inbox.assignedAdminIds, inbox.acceptScheduledCalls]);

  const assignedDirty =
    JSON.stringify([...draftAssigned].sort()) !==
    JSON.stringify([...inbox.assignedAdminIds].sort());
  const acceptsDirty = draftAccepts !== inbox.acceptScheduledCalls;
  const dirty = assignedDirty || acceptsDirty;

  function toggleAdmin(id: string) {
    setDraftAssigned((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const unassignedAdmins = allAdmins.filter(
    (a) => !draftAssigned.includes(a.id)
  );

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-[14px] font-semibold text-[var(--app-text)]">
              {inbox.displayName}
            </span>
            <span className="font-body text-[11px] text-[var(--app-text-muted)] font-mono">
              {inbox.emailAddress}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {inbox.categories.map((c) => (
              <span
                key={c}
                className="font-body text-[10px] text-[var(--app-text-muted)] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-full px-2 py-0.5 uppercase tracking-wider"
              >
                {c.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
        <div className="font-body text-[10px] text-[var(--app-text-muted)] text-right">
          {inbox.googleCalendarConnectedAt
            ? "Calendar connected"
            : "Calendar not connected"}
          {inbox.assignedAdminIds.length === 0 && (
            <div className="mt-1 text-amber-500">⚠ no admins assigned</div>
          )}
        </div>
      </div>

      {/* Assigned admins as chips */}
      <div>
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
          Assigned admins
        </div>
        {draftAssigned.length === 0 ? (
          <div className="font-body text-[12px] text-[var(--app-text-muted)] italic">
            None — Ollie will fall back to all support-eligible admins.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {draftAssigned.map((id) => {
              const user = allAdmins.find((a) => a.id === id);
              const label = user
                ? user.name || user.email
                : `(missing user ${id.slice(0, 6)}…)`;
              return (
                <button
                  key={id}
                  onClick={() => toggleAdmin(id)}
                  type="button"
                  className="group inline-flex items-center gap-1.5 bg-brand-gold/10 text-[var(--app-gold-text)] border border-brand-gold/30 rounded-full px-2.5 py-1 font-body text-[11px] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 transition-colors"
                  title="Click to unassign"
                >
                  <span>{label}</span>
                  <span className="text-[10px] opacity-60 group-hover:opacity-100">
                    ×
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {unassignedAdmins.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unassignedAdmins.map((a) => (
              <button
                key={a.id}
                onClick={() => toggleAdmin(a.id)}
                type="button"
                className="inline-flex items-center gap-1.5 bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-full px-2.5 py-1 font-body text-[11px] hover:bg-brand-gold/10 hover:border-brand-gold/30 hover:text-[var(--app-gold-text)] transition-colors"
                title="Click to assign"
              >
                + {a.name || a.email}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Accept scheduled calls toggle */}
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draftAccepts}
            onChange={(e) => setDraftAccepts(e.target.checked)}
            className="w-4 h-4 accent-brand-gold"
          />
          <span className="font-body text-[12px] text-[var(--app-text)]">
            Accept scheduled calls
          </span>
        </label>
        <span className="font-body text-[11px] text-[var(--app-text-muted)]">
          Required before Ollie can offer a 15-min slot for this inbox.
        </span>
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={() => {
              setDraftAssigned(inbox.assignedAdminIds);
              setDraftAccepts(inbox.acceptScheduledCalls);
            }}
            type="button"
            disabled={saving}
            className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-[var(--app-text)] px-3 py-1.5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                assignedAdminIds: draftAssigned,
                acceptScheduledCalls: draftAccepts,
              })
            }
            type="button"
            disabled={saving}
            className="btn-gold font-body text-[12px] px-4 py-1.5 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
