"use client";

import { useState, useEffect, useCallback } from "react";

interface KnowledgeEntry {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  source: string | null;
  sourceType: string;
  tags: string[];
  isApproved: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

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

const CATEGORY_LABELS: Record<string, string> = {
  CAPE_UPDATE: "CAPE Update",
  LEGAL_CHANGE: "Legal Change",
  TARIFF_RATE: "Tariff Rate",
  STRATEGY_TIP: "Strategy Tip",
  COUNTRY_POLICY: "Country Policy",
  BROKER_GUIDANCE: "Broker Guidance",
  LEGAL_GUIDANCE: "Legal Guidance",
  GENERAL: "General",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  ADMIN_PASTE: "Admin",
  WEB_RESEARCH: "Research",
  SYSTEM_SEED: "System",
};

export default function KnowledgeTable() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [approvedFilter, setApprovedFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (approvedFilter) params.set("approved", approvedFilter);
    params.set("page", String(page));
    params.set("limit", "25");

    const res = await fetch(`/api/admin/knowledge?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [search, category, approvedFilter, page]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Remove this knowledge entry?")) return;
    setDeleting(id);
    await fetch(`/api/admin/knowledge/${id}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  }

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search entries..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm bg-[var(--app-bg-secondary)] border border-[var(--app-border)] text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:outline-none focus:ring-1 focus:ring-brand-gold/50"
        />
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg text-sm bg-[var(--app-bg-secondary)] border border-[var(--app-border)] text-[var(--app-text)]"
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={approvedFilter}
          onChange={(e) => { setApprovedFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg text-sm bg-[var(--app-bg-secondary)] border border-[var(--app-border)] text-[var(--app-text)]"
        >
          <option value="">All Status</option>
          <option value="true">Approved</option>
          <option value="false">Pending</option>
        </select>
      </div>

      {/* Count */}
      <div className="text-xs text-[var(--app-text-muted)]">
        {total} {total === 1 ? "entry" : "entries"} found
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-[var(--app-text-muted)]">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-[var(--app-text-muted)]">
          No knowledge entries found. Add one from the &quot;Add New&quot; tab.
        </div>
      ) : (
        <div className="border border-[var(--app-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--app-bg-secondary)] text-[var(--app-text-muted)] text-left">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Category</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Source</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="border-t border-[var(--app-border)] hover:bg-[var(--app-hover)] transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--app-text)]">{entry.title}</div>
                      <div className="text-xs text-[var(--app-text-muted)] mt-0.5 sm:hidden">
                        {CATEGORY_LABELS[entry.category] || entry.category}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.GENERAL}`}>
                        {CATEGORY_LABELS[entry.category] || entry.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--app-text-muted)] text-xs">
                      {SOURCE_TYPE_LABELS[entry.sourceType] || entry.sourceType}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        entry.isApproved ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                      }`}>
                        {entry.isApproved ? "Approved" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                        disabled={deleting === entry.id}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 min-h-[36px] min-w-[36px]"
                      >
                        {deleting === entry.id ? "..." : "Remove"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr key={`${entry.id}-detail`} className="border-t border-[var(--app-border)] bg-[var(--app-bg-secondary)]">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="space-y-3">
                          {entry.summary && (
                            <div>
                              <div className="text-xs font-medium text-[var(--app-text-muted)] mb-1">Summary</div>
                              <p className="text-sm text-[var(--app-text-secondary)]">{entry.summary}</p>
                            </div>
                          )}
                          {entry.tags.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-[var(--app-text-muted)] mb-1">Tags</div>
                              <div className="flex flex-wrap gap-1.5">
                                {entry.tags.map((tag) => (
                                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-brand-gold/10 text-brand-gold">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {entry.source && (
                            <div>
                              <div className="text-xs font-medium text-[var(--app-text-muted)] mb-1">Source</div>
                              {entry.source.startsWith("http") ? (
                                <a href={entry.source} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-gold hover:underline break-all">
                                  {entry.source}
                                </a>
                              ) : (
                                <span className="text-xs text-[var(--app-text-secondary)]">{entry.source}</span>
                              )}
                            </div>
                          )}
                          <div className="text-xs text-[var(--app-text-muted)]">
                            Created {new Date(entry.createdAt).toLocaleDateString()}{entry.createdBy ? ` by ${entry.createdBy}` : ""}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded text-xs border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] disabled:opacity-30 min-h-[36px]"
          >
            Previous
          </button>
          <span className="text-xs text-[var(--app-text-muted)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded text-xs border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] disabled:opacity-30 min-h-[36px]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
