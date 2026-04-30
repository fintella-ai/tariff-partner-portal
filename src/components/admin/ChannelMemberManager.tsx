"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
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

  const activeMemberCodes = useMemo(
    () => new Set(members.map((m) => m.partnerCode)),
    [members],
  );

  const byUpline = useMemo(() => {
    const map: Record<string, Partner[]> = {};
    for (const p of partners) {
      const key = p.referredByPartnerCode || "";
      (map[key] ||= []).push(p);
    }
    return map;
  }, [partners]);

  const getDownline = useCallback((code: string): Partner[] => {
    const root = partners.find((p) => p.partnerCode === code);
    if (!root) return [];
    const out: Partner[] = [];
    const queue = [code];
    while (queue.length) {
      const c = queue.shift()!;
      const kids = (byUpline[c] || []).sort((a, b) => displayName(a).localeCompare(displayName(b)));
      for (const k of kids) {
        out.push(k);
        queue.push(k.partnerCode);
      }
    }
    return out;
  }, [partners, byUpline]);

  const getDepth = useCallback((p: Partner, rootCode: string): number => {
    let d = 0;
    let cur: string | null | undefined = p.referredByPartnerCode;
    while (cur && cur !== rootCode && d < 10) {
      const n = partners.find((x) => x.partnerCode === cur);
      cur = n?.referredByPartnerCode;
      d++;
    }
    return d + 1;
  }, [partners]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase().trim();
    return partners
      .filter((p) => {
        const name = displayName(p).toLowerCase();
        const code = p.partnerCode.toLowerCase();
        const email = (p.email || "").toLowerCase();
        return name.includes(q) || code.includes(q) || email.includes(q);
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)))
      .slice(0, 20);
  }, [search, partners]);

  const expandedDownline = useMemo(() => {
    if (!expandedCode) return [];
    return getDownline(expandedCode);
  }, [expandedCode, getDownline]);

  const toggleOne = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const selectAllDownline = (rootCode: string) => {
    const dl = getDownline(rootCode);
    const root = partners.find((p) => p.partnerCode === rootCode);
    setSelected((prev) => {
      const next = new Set(prev);
      if (root && !activeMemberCodes.has(rootCode)) next.add(rootCode);
      for (const p of dl) {
        if (!activeMemberCodes.has(p.partnerCode)) next.add(p.partnerCode);
      }
      return next;
    });
  };

  const deselectAllDownline = (rootCode: string) => {
    const dl = getDownline(rootCode);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(rootCode);
      for (const p of dl) next.delete(p.partnerCode);
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
      setMessage(`Added ${d.added} partner${d.added === 1 ? "" : "s"}.`);
      setSelected(new Set());
      setSearch("");
      setExpandedCode(null);
      await loadAll();
      onMembersChanged?.();
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const renderPartnerRow = (p: Partner, indent: number, showDownlineBtn: boolean) => {
    const isMember = activeMemberCodes.has(p.partnerCode);
    const isSelected = selected.has(p.partnerCode);
    const dlCount = getDownline(p.partnerCode).length;
    return (
      <div
        key={p.partnerCode}
        className={`flex items-center gap-2 px-3 py-2 hover:bg-[var(--app-hover)] ${isMember ? "opacity-50" : ""}`}
        style={{ paddingLeft: 12 + indent * 20 }}
      >
        <input
          type="checkbox"
          checked={isMember || isSelected}
          disabled={isMember}
          onChange={() => !isMember && toggleOne(p.partnerCode)}
          className="accent-[#c4a050] shrink-0"
        />
        <span className="font-body text-[12px] text-[var(--app-text)] truncate flex-1">
          {displayName(p)}
        </span>
        <span className="font-mono text-[10px] theme-text-muted shrink-0">{p.partnerCode}</span>
        <span className="font-body text-[10px] theme-text-faint uppercase tracking-wider shrink-0">
          {p.tier || "—"}
        </span>
        {isMember && <span className="text-[10px] text-green-400 shrink-0">✓</span>}
        {showDownlineBtn && dlCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setExpandedCode(expandedCode === p.partnerCode ? null : p.partnerCode); }}
            className="font-body text-[10px] text-brand-gold hover:underline shrink-0"
          >
            {expandedCode === p.partnerCode ? "▾ hide" : `▸ ${dlCount} downline`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="theme-card p-4 space-y-3">
      <div className="text-sm font-medium">👥 Add Members</div>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setExpandedCode(null); }}
          placeholder="Search by name, email, or partner code…"
          className="theme-input w-full text-sm pl-8"
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] theme-text-muted">🔍</span>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setSelected(new Set(partners.filter((p) => !activeMemberCodes.has(p.partnerCode)).map((p) => p.partnerCode)));
          }}
          className="font-body text-[11px] text-brand-gold hover:underline"
        >
          Select all partners ({partners.filter((p) => !activeMemberCodes.has(p.partnerCode)).length})
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="font-body text-[11px] theme-text-muted hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Selected chips */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(selected).slice(0, 10).map((code) => {
            const p = partners.find((x) => x.partnerCode === code);
            return (
              <span key={code} className="inline-flex items-center gap-1 bg-brand-gold/10 border border-brand-gold/30 rounded-full px-2.5 py-0.5 font-body text-[11px] text-brand-gold">
                {p ? displayName(p) : code}
                <button type="button" onClick={() => toggleOne(code)} className="hover:text-red-400 ml-0.5">×</button>
              </span>
            );
          })}
          {selected.size > 10 && (
            <span className="font-body text-[11px] theme-text-muted self-center">+{selected.size - 10} more</span>
          )}
        </div>
      )}

      {/* Search results */}
      {search.trim() && (
        <div className="border border-[var(--app-border)] rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--app-border)] bg-[var(--app-input-bg)] flex items-center justify-between">
            <span className="font-body text-[11px] theme-text-muted">
              {searchResults.length === 0 ? "No matches" : `${searchResults.length} match${searchResults.length === 1 ? "" : "es"}`}
            </span>
            {searchResults.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const p of searchResults) if (!activeMemberCodes.has(p.partnerCode)) next.add(p.partnerCode);
                    return next;
                  });
                }}
                className="font-body text-[10px] text-brand-gold hover:underline"
              >
                Select all results
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-[var(--app-border)]">
            {searchResults.map((p) => (
              <div key={p.partnerCode}>
                {renderPartnerRow(p, 0, true)}
                {/* Expanded downline */}
                {expandedCode === p.partnerCode && expandedDownline.length > 0 && (
                  <div className="bg-[var(--app-input-bg)]">
                    <div className="flex items-center justify-between px-3 py-1.5 border-t border-b border-[var(--app-border)]">
                      <span className="font-body text-[10px] theme-text-muted">{expandedDownline.length} in downline</span>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => selectAllDownline(p.partnerCode)}
                          className="font-body text-[10px] text-brand-gold hover:underline">Select all</button>
                        <button type="button" onClick={() => deselectAllDownline(p.partnerCode)}
                          className="font-body text-[10px] theme-text-muted hover:underline">Deselect all</button>
                      </div>
                    </div>
                    {expandedDownline.map((dl) => renderPartnerRow(dl, getDepth(dl, p.partnerCode), false))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={submit}
        disabled={submitting || selected.size === 0}
        className="theme-btn-primary text-sm px-3 py-1.5 disabled:opacity-50 w-full"
      >
        {submitting ? "Adding…" : `Add ${selected.size} partner${selected.size === 1 ? "" : "s"} to channel`}
      </button>
      {message && <div className="font-body text-[12px] text-brand-gold">{message}</div>}

      {/* Current members */}
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
                <span className="font-body text-[10px] theme-text-faint uppercase tracking-wider">{m.source}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
