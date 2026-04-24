"use client";

/**
 * My AI Availability card — per-admin toggles for PartnerOS escalation
 * participation. Phase 3c.4b of the roadmap.
 *
 * Rendered inside /admin/settings → Integrations tab. Each admin edits
 * only their OWN record. Gates what Ollie can offer:
 *   - availableForLiveChat → show "start live chat" path
 *   - availableForLiveCall → show "talk on the phone now" path
 *   - personalCellPhone → required before isITEmergencyContact can matter
 *
 * Super admin sees an extra toggle for `isITEmergencyContact` (wires into
 * emergency call fan-out). Regular admins do not see that toggle.
 */
import { useEffect, useState } from "react";

interface Availability {
  id: string;
  email: string;
  name: string | null;
  role: string;
  availableForLiveChat: boolean;
  availableForLiveCall: boolean;
  personalCellPhone: string | null;
  isITEmergencyContact: boolean;
  lastHeartbeatAt: string | null;
}

export default function MyAvailabilityCard() {
  const [data, setData] = useState<Availability | null>(null);
  const [draftPhone, setDraftPhone] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function load() {
    try {
      setError(null);
      const res = await fetch("/api/admin/me/availability");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { availability } = await res.json();
      setData(availability);
      setDraftPhone(availability.personalCellPhone ?? "");
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(patch: Partial<Availability>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/me/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Save failed (${res.status})`);
      }
      await load();
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5 font-body text-[13px] text-[var(--app-text-muted)]">
        Loading your AI availability…
      </div>
    );
  }
  if (!data) return null;

  const phoneDirty = (draftPhone.trim() || null) !== (data.personalCellPhone ?? null);
  const isSuperAdmin = data.role === "super_admin";
  const isOnline =
    data.lastHeartbeatAt
      ? Date.now() - new Date(data.lastHeartbeatAt).getTime() < 2 * 60 * 1000
      : false;

  return (
    <div className="card">
      <div className="p-5 border-b border-[var(--app-border)] flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--app-text)]">
            My AI Availability
          </h3>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1">
            Controls whether Ollie (the AI support specialist) can transfer
            partner conversations to you. Only applies while your heartbeat is
            fresh — close your admin tab and you go offline automatically.
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-[11px] ${
            isOnline
              ? "bg-green-500/10 text-green-500 border border-green-500/30"
              : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-[var(--app-text-faint)]"}`}
          />
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-500/10 border-b border-red-500/20 font-body text-[12px] text-red-500">
          {error}
        </div>
      )}

      <div className="p-5 space-y-4">
        <Toggle
          label="Available for live chat"
          sub="Ollie will show a partner 'chat with a human now' when any admin with this flag is online."
          value={data.availableForLiveChat}
          onChange={(v) => save({ availableForLiveChat: v })}
          disabled={saving}
        />
        <Toggle
          label="Available for live phone transfer"
          sub="Ollie will confirm the partner's number before bridging a call. Never dials silently."
          value={data.availableForLiveCall}
          onChange={(v) => save({ availableForLiveCall: v })}
          disabled={saving}
        />

        <div>
          <label className="block font-body text-[12px] font-medium text-[var(--app-text)] mb-1">
            Personal cell phone
          </label>
          <div className="flex items-center gap-2">
            <input
              type="tel"
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder="+15551234567"
              className="flex-1 font-mono text-[13px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-md px-3 py-2 focus:outline-none focus:border-brand-gold/50"
            />
            <button
              type="button"
              onClick={() =>
                save({ personalCellPhone: draftPhone.trim() === "" ? null : draftPhone.trim() })
              }
              disabled={saving || !phoneDirty}
              className="btn-gold font-body text-[12px] px-4 py-2 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">
            E.164 format. Used only for the IT-emergency outbound call
            chain when Ollie confirms a portal bug is blocking partners.
          </p>
        </div>

        {isSuperAdmin && (
          <>
            <Toggle
              label="Receive IT emergency calls"
              sub="When Ollie classifies a portal symptom as a confirmed bug, Twilio will outbound-dial your personal cell above. Super admin only."
              value={data.isITEmergencyContact}
              onChange={(v) => save({ isITEmergencyContact: v })}
              disabled={saving || !data.personalCellPhone}
              warn={
                data.isITEmergencyContact && !data.personalCellPhone
                  ? "Enable personal cell above first — this toggle has no effect without a number."
                  : undefined
              }
            />
            <EmergencyTestButton />
          </>
        )}

        {savedAt && Date.now() - savedAt < 3000 && (
          <div className="font-body text-[11px] text-green-500">
            ✓ Saved
          </div>
        )}
      </div>
    </div>
  );
}

function EmergencyTestButton() {
  const [firing, setFiring] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fire() {
    if (!confirm("Fire a TEST IT emergency? This will send a [TEST]-marked email + notifications to every admin with isITEmergencyContact=true.")) {
      return;
    }
    setFiring(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/emergency-test", { method: "POST" });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}));
        throw new Error(msg || `Test failed (${res.status})`);
      }
      const { result: r } = await res.json();
      setResult(
        `Fired — paged ${r.contactCount} contact${r.contactCount === 1 ? "" : "s"}, email ${r.emailStatus}, ${r.notificationsCreated} notification${r.notificationsCreated === 1 ? "" : "s"}, workspace ${r.workspacePosted ? "posted" : "skipped"}.`
      );
    } catch (e: any) {
      setError(e?.message || "Test failed");
    } finally {
      setFiring(false);
    }
  }

  return (
    <div className="pt-2 border-t border-[var(--app-border)]">
      <button
        type="button"
        onClick={fire}
        disabled={firing}
        className="font-body text-[12px] text-red-500 border border-red-500/30 hover:bg-red-500/5 rounded-md px-3 py-1.5 disabled:opacity-50"
      >
        {firing ? "Firing test…" : "🚨 Send test IT emergency"}
      </button>
      <p className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">
        Dry-run the IT emergency chain without a real partner incident. Verifies
        email routing + notification fan-out + workspace post. [TEST]-prefixed.
      </p>
      {result && (
        <div className="mt-2 font-body text-[11px] text-green-500">
          ✓ {result}
        </div>
      )}
      {error && (
        <div className="mt-2 font-body text-[11px] text-red-500">{error}</div>
      )}
    </div>
  );
}

function Toggle({
  label,
  sub,
  value,
  onChange,
  disabled,
  warn,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  warn?: string;
}) {
  return (
    <div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 w-4 h-4 accent-brand-gold shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="font-body text-[13px] text-[var(--app-text)]">
            {label}
          </div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 leading-relaxed">
            {sub}
          </div>
          {warn && (
            <div className="font-body text-[11px] text-amber-500 mt-1">
              {warn}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}
