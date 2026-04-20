// src/app/(partner)/dashboard/messages/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Thread = {
  id: string;
  participantA: string;
  participantB: string;
  lastMessageAt: string;
  createdAt: string;
  counterpartyCode: string;
  counterpartyName: string;
  unreadCount: number;
};

export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/partner-dm/threads");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setThreads(d.threads || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="font-heading text-xl mb-4">💬 Messages</h1>
      <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">
        Direct messages with your upline or downline. Skip-level and sibling conversations are not supported.
      </p>

      {error && <div className="text-red-400 text-sm mb-3">Error: {error}</div>}
      {loading && threads.length === 0 && <div className="text-sm opacity-70">Loading…</div>}
      {!loading && threads.length === 0 && (
        <div className="font-body text-[13px] text-[var(--app-text-muted)] border border-dashed border-[var(--app-border)] rounded-xl p-8 text-center">
          No conversations yet. Start one by clicking "Message" on a downline partner in{" "}
          <Link href="/dashboard/downline" className="underline">Downline</Link>.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {threads.map((t) => (
          <Link
            key={t.id}
            href={`/dashboard/messages/${t.id}`}
            className="flex items-center justify-between border border-[var(--app-border)] rounded-xl px-4 py-3 hover:bg-[var(--app-bg-secondary)] transition-colors"
          >
            <div className="flex flex-col">
              <div className="font-body font-semibold text-sm">{t.counterpartyName}</div>
              <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                {t.counterpartyCode} · last activity {new Date(t.lastMessageAt).toLocaleString()}
              </div>
            </div>
            {t.unreadCount > 0 && (
              <span className="bg-blue-500/15 text-blue-400 text-[11px] font-semibold rounded-full px-2 py-0.5">
                {t.unreadCount} unread
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
