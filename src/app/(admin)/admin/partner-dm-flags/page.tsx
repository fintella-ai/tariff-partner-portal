// src/app/(admin)/admin/partner-dm-flags/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Flag = {
  id: string;
  messageId: string;
  flaggerPartnerCode: string;
  reason: string | null;
  reviewedAt: string | null;
  reviewedByAdminEmail: string | null;
  verdict: string | null;
  createdAt: string;
  message: {
    id: string;
    threadId: string;
    senderPartnerCode: string;
    content: string;
    createdAt: string;
  };
};

type FilterStatus = "pending" | "reviewed" | "all";

export default function AdminFlagInboxPage() {
  const [status, setStatus] = useState<FilterStatus>("pending");
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/partner-dm-flags?status=${status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setFlags(d.flags || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);

  // SSE live push
  useEffect(() => {
    const es = new EventSource("/api/admin/partner-dm-flags/stream");
    const refresh = () => load();
    es.addEventListener("partner_dm.flag.created", refresh);
    es.onerror = () => {};
    return () => { es.close(); };
  }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="font-heading text-xl mb-1">🚩 Partner DM Flags</h1>
      <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">
        Review partner-flagged messages. Dismissing lifts the sender's throttle; confirming promotes them to suspended.
      </p>

      <div className="flex gap-2 mb-4">
        {(["pending", "reviewed", "all"] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`font-body text-[12px] px-3 py-1 rounded-full border ${
              status === s
                ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                : "border-[var(--app-border)] text-[var(--app-text-muted)]"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && <div className="text-red-400 text-sm mb-3">Error: {error}</div>}
      {loading && flags.length === 0 && <div className="text-sm opacity-70">Loading…</div>}
      {!loading && flags.length === 0 && (
        <div className="font-body text-[13px] text-[var(--app-text-muted)] border border-dashed border-[var(--app-border)] rounded-xl p-8 text-center">
          No {status} flags.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {flags.map((f) => (
          <Link
            key={f.id}
            href={`/admin/partner-dm-flags/${f.id}`}
            className="border border-[var(--app-border)] rounded-xl p-3 hover:bg-[var(--app-bg-secondary)] transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="font-body text-[12px]">
                <span className="font-semibold">{f.flaggerPartnerCode}</span>
                <span className="text-[var(--app-text-muted)]"> flagged </span>
                <span className="font-semibold">{f.message.senderPartnerCode}</span>
              </div>
              <div className="flex items-center gap-2">
                {f.verdict === "dismissed" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">Dismissed</span>}
                {f.verdict === "confirmed" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">Confirmed</span>}
                {!f.verdict && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">Pending</span>}
              </div>
            </div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)] line-clamp-2">
              "{f.message.content.slice(0, 160)}{f.message.content.length > 160 ? "…" : ""}"
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">
              {new Date(f.createdAt).toLocaleString()}
              {f.reviewedByAdminEmail && ` · reviewed by ${f.reviewedByAdminEmail}`}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
