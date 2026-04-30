"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SegmentRuleBuilder from "@/components/ui/SegmentRuleBuilder";

type ChannelRow = {
  id: string;
  name: string;
  description: string | null;
  segmentRule: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { memberships: number; messages: number };
};

export default function ChannelsListPanel() {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-channel form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [segmentRule, setSegmentRule] = useState<string>('{"filters":[]}');
  const [replyMode, setReplyMode] = useState<string>("threads");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/channels");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setChannels(d.channels || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) { setError("Name required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        name: name.trim(),
        description: description.trim() || null,
        replyMode,
      };
      try {
        const parsed = JSON.parse(segmentRule);
        if (parsed?.filters?.length > 0) payload.segmentRule = segmentRule;
      } catch {}
      const r = await fetch("/api/admin/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      setName(""); setDescription(""); setSegmentRule('{"filters":[]}');
      setShowNew(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">📣 Channels</h1>
        <button
          type="button"
          onClick={() => setShowNew((v) => !v)}
          className="theme-btn-primary text-sm px-3 py-1.5"
        >
          {showNew ? "Cancel" : "+ New Channel"}
        </button>
      </div>

      {showNew && (
        <div className="theme-card p-4 space-y-3">
          <div className="text-sm font-medium">Create channel</div>
          <input
            className="theme-input w-full text-sm"
            placeholder="Channel name (e.g. L1 Partners)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="theme-input w-full text-sm"
            placeholder="Optional description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <label className="block font-body text-[11px] tracking-wider uppercase theme-text-muted mb-1">Reply Mode</label>
            <div className="space-y-1.5">
              {[
                { value: "open", label: "Chat freely", desc: "Partners can reply in the channel — everyone sees messages" },
                { value: "disabled", label: "Admin only (no replies)", desc: "Announcement-only — partners cannot respond" },
                { value: "threads", label: "Reply 1-on-1 to admin", desc: "Partners reply privately in a direct thread with admin" },
              ].map((opt) => (
                <label key={opt.value} className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${replyMode === opt.value ? "border-brand-gold/40 bg-brand-gold/5" : "border-[var(--app-border)]"}`}>
                  <input type="radio" name="replyMode" value={opt.value} checked={replyMode === opt.value} onChange={() => setReplyMode(opt.value)} className="accent-[#c4a050] mt-0.5" />
                  <div>
                    <div className="font-body text-[12px] font-medium text-[var(--app-text)]">{opt.label}</div>
                    <div className="font-body text-[10px] theme-text-muted">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <SegmentRuleBuilder onChange={setSegmentRule} />
          {error && <div className="text-xs text-red-500">{error}</div>}
          <button
            type="button"
            disabled={submitting}
            onClick={create}
            className="theme-btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create channel"}
          </button>
        </div>
      )}

      {loading && <div className="text-sm opacity-70">Loading channels…</div>}
      {!loading && channels.length === 0 && (
        <div className="theme-card p-6 text-center text-sm opacity-70">
          No channels yet. Create one to broadcast announcements to a segment of partners.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {channels.map((c) => (
          <Link
            key={c.id}
            href={`/admin/channels/${c.id}`}
            className="theme-card p-4 block hover:opacity-90 transition-opacity"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{c.name}</div>
              <div className="text-[11px] opacity-60">{new Date(c.updatedAt).toLocaleDateString()}</div>
            </div>
            {c.description && <div className="text-sm opacity-80 mt-1">{c.description}</div>}
            <div className="flex gap-3 text-xs opacity-70 mt-2">
              <span>{c._count.memberships} members</span>
              <span>·</span>
              <span>{c._count.messages} announcements</span>
              {c.segmentRule && <><span>·</span><span>segment-driven</span></>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
