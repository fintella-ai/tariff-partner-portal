"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Channel-member admin panel.
 *
 * UX:
 *   1. Dropdown to pick an L1 partner (no upline). Picking one loads
 *      their full downline tree (L2 + L3 + L4+).
 *   2. Below the dropdown: a checkbox list of that L1 + every partner
 *      in their chain. Top-level "Select entire downline" toggle
 *      flips all of them at once.
 *   3. Submit POSTs the selected partnerCodes to
 *      /api/admin/channels/[id]/members.
 *
 * Current members list sits at the bottom so the admin can see who's
 * already in the channel without leaving the panel.
 */

type Partner = {
  id: string;
  partnerCode: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  tier: string | null;
  referredByPartnerCode: string | null;
  status?: string;
};

type Member = {
  id: string;
  partnerCode: string;
  source: string;
  createdAt: string;
  partner: {
    partnerCode: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    tier: string | null;
  } | null;
};

function displayName(p: Pick<Partner, "firstName" | "lastName" | "partnerCode">): string {
  return `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.partnerCode;
}

export default function ChannelMemberManager({ channelId, onMembersChanged }: { channelId: string; onMembersChanged?: () => void }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [rootCode, setRootCode] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([
        fetch("/api/admin/partners").then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/channels/${channelId}/members`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (pRes?.partners) setPartners(pRes.partners);
      if (mRes?.members) setMembers(mRes.members);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // L1 roots = partners with no upline (referredByPartnerCode is null).
  // Using `tier` alone would miss someone manually marked L1 but with a
  // stale upline row, and vice-versa; chaining is the ground truth.
  const l1Roots = useMemo(
    () =>
      partners
        .filter((p) => !p.referredByPartnerCode)
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [partners],
  );

  // Downline of the currently-picked root. Walks the chain breadth-first
  // via referredByPartnerCode. Includes the root itself at the top of
  // the list so the admin can add them alone or with their subordinates.
  const downline = useMemo(() => {
    if (!rootCode) return [] as Partner[];
    const root = partners.find((p) => p.partnerCode === rootCode);
    if (!root) return [];
    const byUpline: Record<string, Partner[]> = {};
    for (const p of partners) {
      const key = p.referredByPartnerCode || "";
      (byUpline[key] ||= []).push(p);
    }
    const out: Partner[] = [root];
    const stack = [root.partnerCode];
    while (stack.length) {
      const code = stack.shift()!;
      const kids = (byUpline[code] || []).sort((a, b) => displayName(a).localeCompare(displayName(b)));
      for (const k of kids) {
        out.push(k);
        stack.push(k.partnerCode);
      }
    }
    return out;
  }, [rootCode, partners]);

  const activeMemberCodes = useMemo(
    () => new Set(members.map((m) => m.partnerCode)),
    [members],
  );

  // When the root changes, preselect every partner in the downline that
  // is NOT already an active member. That way "Add selected" defaults to
  // onboarding the whole chain in one click.
  useEffect(() => {
    if (!rootCode) { setSelected(new Set()); return; }
    setSelected(new Set(downline.filter((p) => !activeMemberCodes.has(p.partnerCode)).map((p) => p.partnerCode)));
  }, [rootCode, downline, activeMemberCodes]);

  const toggleAll = () => {
    const toggleCandidates = downline.filter((p) => !activeMemberCodes.has(p.partnerCode));
    if (toggleCandidates.every((p) => selected.has(p.partnerCode))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(toggleCandidates.map((p) => p.partnerCode)));
    }
  };

  const toggleOne = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerCodes: Array.from(selected) }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setMessage(`Added ${d.added} partner${d.added === 1 ? "" : "s"}. Notification + email sent.`);
      setSelected(new Set());
      await loadAll();
      onMembersChanged?.();
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="theme-card p-4 space-y-3">
      <div className="text-sm font-medium">👥 Members</div>

      <div>
        <label className="block font-body text-[11px] tracking-wider uppercase theme-text-muted mb-1">
          Select L1 (upline root) to expand their downline
        </label>
        <select
          value={rootCode}
          onChange={(e) => setRootCode(e.target.value)}
          className="theme-input w-full text-sm"
        >
          <option value="">— Pick an L1 partner —</option>
          {l1Roots.map((p) => (
            <option key={p.partnerCode} value={p.partnerCode}>
              {displayName(p)} ({p.partnerCode})
            </option>
          ))}
        </select>
      </div>

      {rootCode && downline.length > 0 && (
        <div className="border border-[var(--app-border)] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--app-border)] bg-[var(--app-input-bg)]">
            <label className="flex items-center gap-2 font-body text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={downline.filter((p) => !activeMemberCodes.has(p.partnerCode)).every((p) => selected.has(p.partnerCode)) && downline.some((p) => !activeMemberCodes.has(p.partnerCode))}
                onChange={toggleAll}
                className="accent-[#c4a050]"
              />
              <span>Select entire downline</span>
            </label>
            <span className="font-body text-[11px] theme-text-muted">
              {selected.size} selected · {downline.length} in chain
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-[var(--app-border)]">
            {downline.map((p, i) => {
              const isRoot = p.partnerCode === rootCode;
              const depth = (() => {
                // Compute tier depth relative to root
                let d = 0;
                let cur: string | null | undefined = p.referredByPartnerCode;
                while (cur && cur !== rootCode && d < 10) {
                  const n = partners.find((x) => x.partnerCode === cur);
                  cur = n?.referredByPartnerCode;
                  d++;
                }
                return isRoot ? 0 : d + 1;
              })();
              const isActiveMember = activeMemberCodes.has(p.partnerCode);
              return (
                <label
                  key={p.partnerCode}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--app-hover)] ${isActiveMember ? "opacity-60" : ""}`}
                  style={{ paddingLeft: 12 + depth * 20 }}
                >
                  <input
                    type="checkbox"
                    checked={isActiveMember || selected.has(p.partnerCode)}
                    disabled={isActiveMember}
                    onChange={() => !isActiveMember && toggleOne(p.partnerCode)}
                    className="accent-[#c4a050]"
                  />
                  <span className="font-body text-[12px] text-[var(--app-text)] truncate flex-1">
                    {displayName(p)}
                  </span>
                  <span className="font-mono text-[10px] theme-text-muted">{p.partnerCode}</span>
                  <span className="font-body text-[10px] theme-text-faint uppercase tracking-wider">
                    {isRoot ? "L1" : `L${depth + 1}`}
                  </span>
                  {isActiveMember && <span className="text-[10px] text-green-400">✓ member</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || selected.size === 0}
        className="theme-btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
      >
        {submitting ? "Adding…" : `Add ${selected.size} to channel`}
      </button>
      {message && (
        <div className="font-body text-[12px] text-brand-gold">{message}</div>
      )}

      {/* Current members list */}
      <div className="pt-3 border-t border-[var(--app-border)]">
        <div className="font-body text-[11px] tracking-wider uppercase theme-text-muted mb-2">
          Current members ({members.length})
        </div>
        {loading ? (
          <div className="font-body text-[12px] theme-text-muted">Loading…</div>
        ) : members.length === 0 ? (
          <div className="font-body text-[12px] theme-text-muted">No members yet.</div>
        ) : (
          <div className="max-h-48 overflow-y-auto divide-y divide-[var(--app-border)]">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-1.5 px-1">
                <span className="font-body text-[12px] text-[var(--app-text)] truncate flex-1">
                  {m.partner ? displayName(m.partner) : m.partnerCode}
                </span>
                <span className="font-mono text-[10px] theme-text-muted">{m.partnerCode}</span>
                <span className="font-body text-[10px] theme-text-faint uppercase tracking-wider">
                  {m.source}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
