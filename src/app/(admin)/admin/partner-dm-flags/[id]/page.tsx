// src/app/(admin)/admin/partner-dm-flags/[id]/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Message = {
  id: string;
  threadId: string;
  senderPartnerCode: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

type Flag = {
  id: string;
  messageId: string;
  flaggerPartnerCode: string;
  reason: string | null;
  reviewedAt: string | null;
  reviewedByAdminEmail: string | null;
  verdict: string | null;
  createdAt: string;
};

type Thread = {
  id: string;
  participantA: string;
  participantB: string;
};

export default function FlagDetailPage() {
  const params = useParams() as { id?: string };
  const router = useRouter();
  const flagId = params?.id;

  const [flag, setFlag] = useState<Flag | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [context, setContext] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!flagId) return;
    try {
      const r = await fetch(`/api/admin/partner-dm-flags/${flagId}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setFlag(d.flag);
      setThread(d.thread);
      setContext(d.context || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [flagId]);

  useEffect(() => { load(); }, [load]);

  async function review(verdict: "dismissed" | "confirmed") {
    if (!flagId || busy) return;
    if (!confirm(`Are you sure you want to ${verdict === "dismissed" ? "DISMISS" : "CONFIRM"} this flag?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/partner-dm-flags/${flagId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || `Review failed (${r.status})`);
        return;
      }
      router.push("/admin/partner-dm-flags");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/admin/partner-dm-flags" className="font-body text-[12px] underline">← Back to flag inbox</Link>
        <div className="mt-4 text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!flag || !thread) {
    return <div className="p-6 max-w-3xl mx-auto text-sm opacity-70">Loading…</div>;
  }

  const alreadyReviewed = !!flag.reviewedAt;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/admin/partner-dm-flags" className="font-body text-[12px] underline">← Back to flag inbox</Link>

      <h1 className="font-heading text-xl mt-3 mb-2">🚩 Flag detail</h1>

      <div className="border border-[var(--app-border)] rounded-xl p-4 mb-4">
        <div className="font-body text-[12px] mb-2">
          <span className="font-semibold">{flag.flaggerPartnerCode}</span>
          <span className="text-[var(--app-text-muted)]"> flagged a message from </span>
          <span className="font-semibold">{context.find((m) => m.id === flag.messageId)?.senderPartnerCode || "—"}</span>
          <span className="text-[var(--app-text-muted)]"> in thread </span>
          <span className="font-mono">{thread.id.slice(0, 8)}…</span>
        </div>
        {flag.reason && (
          <div className="bg-[var(--app-bg-secondary)] rounded-lg p-3 font-body text-[12px]">
            <div className="text-[var(--app-text-muted)] mb-1">Flagger's reason:</div>
            <div>{flag.reason}</div>
          </div>
        )}
        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-2">
          Filed {new Date(flag.createdAt).toLocaleString()}
        </div>
      </div>

      <div className="font-body text-[12px] text-[var(--app-text-muted)] mb-2">
        Context: {context.length} messages (up to 10 before, 10 after)
      </div>

      <div className="flex flex-col gap-2 mb-6">
        {context.map((m) => {
          const isFlagged = m.id === flag.messageId;
          return (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 border ${
                isFlagged
                  ? "bg-red-500/10 border-red-500/40 ring-2 ring-red-500/50"
                  : "bg-[var(--app-bg-secondary)] border-[var(--app-border)]"
              }`}
            >
              <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-0.5 flex items-center gap-2">
                <span className="font-semibold">{m.senderPartnerCode}</span>
                <span>·</span>
                <span>{new Date(m.createdAt).toLocaleString()}</span>
                {m.editedAt && <span className="italic">(edited)</span>}
                {m.deletedAt && <span className="italic text-red-400">(deleted)</span>}
                {isFlagged && <span className="text-red-400 font-semibold">← FLAGGED</span>}
              </div>
              <div className="font-body text-[13px] whitespace-pre-wrap">{m.content}</div>
            </div>
          );
        })}
      </div>

      {alreadyReviewed ? (
        <div className="bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-xl p-4">
          <div className="font-body text-[13px] font-semibold mb-1">
            Already reviewed: {flag.verdict === "dismissed" ? "Dismissed" : "Confirmed"}
          </div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)]">
            {flag.reviewedByAdminEmail} · {flag.reviewedAt && new Date(flag.reviewedAt).toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => review("dismissed")}
            disabled={busy}
            className="flex-1 font-body text-[13px] px-4 py-2.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 disabled:opacity-40"
          >
            Dismiss flag (lift throttle)
          </button>
          <button
            onClick={() => review("confirmed")}
            disabled={busy}
            className="flex-1 font-body text-[13px] px-4 py-2.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 disabled:opacity-40"
          >
            Confirm flag (suspend sender)
          </button>
        </div>
      )}
    </div>
  );
}
