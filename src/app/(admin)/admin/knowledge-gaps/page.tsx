"use client";

import { useState, useEffect, useCallback } from "react";
import { useDevice } from "@/lib/useDevice";

interface KnowledgeGap {
  id: string;
  conversationId: string;
  messageId: string;
  partnerCode: string;
  question: string;
  taraResponse: string;
  category: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface Stats {
  unresolved: number;
  resolved: number;
  total: number;
}

type FilterTab = "all" | "unresolved" | "resolved";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unresolved", label: "Unresolved" },
  { value: "resolved", label: "Resolved" },
];

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminKnowledgeGapsPage() {
  const device = useDevice();
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [stats, setStats] = useState<Stats>({ unresolved: 0, resolved: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("unresolved");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const loadGaps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "unresolved") params.set("resolved", "false");
      if (filter === "resolved") params.set("resolved", "true");
      params.set("page", String(page));
      const res = await fetch(`/api/admin/knowledge-gaps?${params}`);
      if (res.ok) {
        const data = await res.json();
        setGaps(data.gaps || []);
        setStats(data.stats || stats);
        setTotalPages(data.pages || 1);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  async function resolveGap(id: string) {
    setResolving(id);
    try {
      const res = await fetch(`/api/admin/knowledge-gaps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        loadGaps();
      }
    } catch {
      // silent
    } finally {
      setResolving(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase mb-1">
          AI Management
        </div>
        <h1
          className={`font-display ${device.isMobile ? "text-2xl" : "text-3xl"} font-bold mb-1`}
        >
          Knowledge Gaps
        </h1>
        <p className="font-body text-[12px] text-[var(--app-text-muted)]">
          Questions Tara couldn&apos;t fully answer. Use this to identify
          training content holes.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          {
            label: "Unresolved",
            value: stats.unresolved,
            color: "text-yellow-400",
          },
          {
            label: "Resolved",
            value: stats.resolved,
            color: "text-green-400",
          },
          { label: "Total", value: stats.total, color: "text-brand-gold" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg p-3"
          >
            <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">
              {s.label}
            </div>
            <div className={`font-display text-2xl font-bold ${s.color}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2 whitespace-nowrap transition-all min-h-[44px] ${
              filter === tab.value
                ? "bg-brand-gold/15 border-brand-gold/30 text-brand-gold"
                : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Gaps List */}
      {loading ? (
        <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">
          Loading...
        </div>
      ) : gaps.length === 0 ? (
        <div className="bg-[var(--app-card-bg)] border border-dashed border-[var(--app-border)] rounded-xl p-10 text-center">
          <div className="text-4xl mb-2">
            {filter === "unresolved" ? "🎯" : "📭"}
          </div>
          <div className="font-body text-sm text-[var(--app-text-secondary)]">
            {filter === "unresolved"
              ? "No unresolved knowledge gaps. Tara is well-trained!"
              : "No knowledge gaps match this filter."}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {gaps.map((gap) => {
            const isExpanded = expandedId === gap.id;
            return (
              <div
                key={gap.id}
                className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl overflow-hidden"
              >
                {/* Card Header (clickable) */}
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : gap.id)
                  }
                  className="w-full text-left p-4 hover:bg-[var(--app-input-bg)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[14px] font-semibold text-[var(--app-text)] mb-1">
                        {truncate(gap.question, 80)}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-body text-[10px] border rounded-full px-2 py-0.5 ${
                            gap.resolved
                              ? "bg-green-500/10 border-green-500/20 text-green-400"
                              : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                          }`}
                        >
                          {gap.resolved ? "Resolved" : "Unresolved"}
                        </span>
                        {gap.category && (
                          <span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">
                            {gap.category}
                          </span>
                        )}
                        <span className="font-body text-[10px] text-[var(--app-text-muted)]">
                          Partner: {gap.partnerCode}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] whitespace-nowrap">
                        {formatDate(gap.createdAt)}
                      </div>
                      <svg
                        className={`w-4 h-4 text-[var(--app-text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[var(--app-border)]">
                    <div className="pt-4 mb-4">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                        Partner&apos;s Question
                      </div>
                      <div className="font-body text-[13px] text-[var(--app-text-secondary)] whitespace-pre-wrap leading-relaxed bg-[var(--app-input-bg)] rounded-lg p-3">
                        {gap.question}
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                        Tara&apos;s Response
                      </div>
                      <div className="font-body text-[13px] text-[var(--app-text-secondary)] whitespace-pre-wrap leading-relaxed bg-[var(--app-input-bg)] rounded-lg p-3">
                        {gap.taraResponse}
                      </div>
                    </div>

                    {gap.resolved && gap.resolvedBy && (
                      <div className="mb-4">
                        <div className="font-body text-[10px] text-green-400">
                          Resolved by {gap.resolvedBy} on{" "}
                          {gap.resolvedAt
                            ? formatDate(gap.resolvedAt)
                            : "unknown"}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-3 border-t border-[var(--app-border)]">
                      {!gap.resolved && (
                        <button
                          onClick={() => resolveGap(gap.id)}
                          disabled={resolving === gap.id}
                          className="bg-brand-gold/20 border border-brand-gold/30 text-brand-gold rounded-lg px-4 py-2 font-body text-[12px] font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50 min-h-[44px]"
                        >
                          {resolving === gap.id
                            ? "Resolving..."
                            : "Mark Resolved"}
                        </button>
                      )}
                      <span className="font-body text-[10px] text-[var(--app-text-muted)]">
                        ID: {gap.id.substring(0, 12)} | Conversation:{" "}
                        {gap.conversationId.substring(0, 12)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="font-body text-[12px] font-semibold border border-[var(--app-border)] text-[var(--app-text-muted)] rounded-lg px-4 py-2 hover:text-[var(--app-text)] transition-colors disabled:opacity-40 min-h-[44px]"
          >
            Previous
          </button>
          <span className="font-body text-[12px] text-[var(--app-text-muted)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="font-body text-[12px] font-semibold border border-[var(--app-border)] text-[var(--app-text-muted)] rounded-lg px-4 py-2 hover:text-[var(--app-text)] transition-colors disabled:opacity-40 min-h-[44px]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
