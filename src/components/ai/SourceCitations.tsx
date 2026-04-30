"use client";

import { useState, useEffect } from "react";

interface SourceEntry {
  id: string;
  title: string;
  category: string;
  source: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  CAPE_UPDATE: "CAPE",
  LEGAL_CHANGE: "Legal",
  TARIFF_RATE: "Tariff",
  STRATEGY_TIP: "Strategy",
  COUNTRY_POLICY: "Policy",
  BROKER_GUIDANCE: "Broker",
  LEGAL_GUIDANCE: "Legal",
  GENERAL: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
  CAPE_UPDATE: "bg-blue-500/10 text-blue-400",
  LEGAL_CHANGE: "bg-red-500/10 text-red-400",
  TARIFF_RATE: "bg-purple-500/10 text-purple-400",
  STRATEGY_TIP: "bg-green-500/10 text-green-400",
  COUNTRY_POLICY: "bg-orange-500/10 text-orange-400",
  BROKER_GUIDANCE: "bg-cyan-500/10 text-cyan-400",
  LEGAL_GUIDANCE: "bg-yellow-500/10 text-yellow-400",
  GENERAL: "bg-white/5 text-[var(--app-text-muted)]",
};

export default function SourceCitations({ sourceIds }: { sourceIds?: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || loaded || !sourceIds?.length) return;

    // Lazy-load source details on first expand
    Promise.all(
      sourceIds.map((id) =>
        fetch(`/api/admin/knowledge/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => data?.entry as SourceEntry | null)
          .catch(() => null)
      )
    ).then((results) => {
      setSources(results.filter(Boolean) as SourceEntry[]);
      setLoaded(true);
    });
  }, [expanded, loaded, sourceIds]);

  if (!sourceIds?.length) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-[var(--app-text-muted)] hover:text-brand-gold transition-colors flex items-center gap-1"
      >
        <span className={`transition-transform inline-block ${expanded ? "rotate-90" : ""}`}>
          &#9654;
        </span>
        {sourceIds.length} {sourceIds.length === 1 ? "source" : "sources"} referenced
      </button>

      {expanded && (
        <div className="mt-2 pl-3 border-l-2 border-[var(--app-border)] space-y-1.5">
          {!loaded ? (
            <div className="text-xs text-[var(--app-text-muted)]">Loading sources...</div>
          ) : sources.length === 0 ? (
            <div className="text-xs text-[var(--app-text-muted)]">Sources no longer available</div>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[s.category] || CATEGORY_COLORS.GENERAL}`}>
                  {CATEGORY_LABELS[s.category] || s.category}
                </span>
                <span className="text-xs text-[var(--app-text-secondary)] truncate">{s.title}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
