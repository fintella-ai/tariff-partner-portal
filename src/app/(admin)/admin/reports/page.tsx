"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { fmt$ } from "@/lib/format";
import PartnerLink from "@/components/ui/PartnerLink";
import ReportingTabs from "@/components/ui/ReportingTabs";
import SortHeader, { type SortDir } from "@/components/ui/SortHeader";

// ─── Per-admin layout (drag-to-reorder via "Edit layout" button) ──────────
// Mirrors the pattern on /admin (AdminWorkspacePage). Section order
// persists in localStorage so the layout is per-browser/per-admin with no
// schema change.
type SectionId = "keyMetrics" | "partnerStats" | "monthly" | "topPartners";
const DEFAULT_SECTION_ORDER: SectionId[] = ["keyMetrics", "partnerStats", "monthly", "topPartners"];
const LAYOUT_KEY = "fintella.admin.reports.layout.v1";

function readLayout(): SectionId[] {
  if (typeof window === "undefined") return DEFAULT_SECTION_ORDER;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_SECTION_ORDER;
    const parsed = JSON.parse(raw) as SectionId[];
    const known = new Set<SectionId>(DEFAULT_SECTION_ORDER);
    const preserved = parsed.filter((s) => known.has(s));
    const appended = DEFAULT_SECTION_ORDER.filter((s) => !preserved.includes(s));
    return [...preserved, ...appended];
  } catch {
    return DEFAULT_SECTION_ORDER;
  }
}

type Stats = {
  totalPipeline: number;
  totalCommissionsPaid: number;
  totalCommissionsDue: number;
  totalCommissionsPending: number;
  totalPartners: number;
  activePartners: number;
  newPartnersThisMonth: number;
  dealsThisMonth: number;
  closedWonThisMonth: number;
  conversionRate: number;
};

type MonthlyRow = {
  month: string;
  newDeals: number;
  closedWon: number;
  commPaid: number;
  commDue: number;
  newPartners: number;
};

type TopPartner = {
  name: string;
  id: string | null;
  code: string;
  deals: number;
  pipeline: number;
  commission: number;
};

export default function ReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyRow[]>([]);
  const [topPartners, setTopPartners] = useState<TopPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchPartner, setSearchPartner] = useState("");

  // Drag-to-reorder state
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_SECTION_ORDER);
  const [editMode, setEditMode] = useState(false);
  const [draggedSection, setDraggedSection] = useState<SectionId | null>(null);

  useEffect(() => { setSectionOrder(readLayout()); }, []);

  const persistLayout = useCallback((next: SectionId[]) => {
    setSectionOrder(next);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch {}
    }
  }, []);

  const onSectionDragStart = (e: React.DragEvent, id: SectionId) => {
    if (!editMode) return;
    setDraggedSection(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onSectionDragOver = (e: React.DragEvent) => {
    if (!editMode || !draggedSection) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onSectionDrop = (e: React.DragEvent, targetId: SectionId) => {
    if (!editMode || !draggedSection) return;
    e.preventDefault();
    if (draggedSection === targetId) { setDraggedSection(null); return; }
    const next = [...sectionOrder];
    const src = next.indexOf(draggedSection);
    const dst = next.indexOf(targetId);
    if (src < 0 || dst < 0) { setDraggedSection(null); return; }
    next.splice(src, 1);
    next.splice(dst, 0, draggedSection);
    persistLayout(next);
    setDraggedSection(null);
  };

  useEffect(() => {
    fetch("/api/admin/reports")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setMonthlyData(data.monthlyData || []);
        setTopPartners(data.topPartners || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Monthly table sorting
  const [mSort, setMSort] = useState("month");
  const [mDir, setMDir] = useState<SortDir>("desc");
  const toggleMSort = (key: string) => { if (mSort === key) setMDir(mDir === "asc" ? "desc" : "asc"); else { setMSort(key); setMDir("asc"); } };

  const sortedMonthly = useMemo(() => [...monthlyData].sort((a, b) => {
    const av = (a as any)[mSort]; const bv = (b as any)[mSort];
    if (typeof av === "string") return mDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return mDir === "asc" ? av - bv : bv - av;
  }), [mSort, mDir, monthlyData]);

  // Top partners sorting
  const [pSort, setPSort] = useState("commission");
  const [pDir, setPDir] = useState<SortDir>("desc");
  const togglePSort = (key: string) => { if (pSort === key) setPDir(pDir === "asc" ? "desc" : "asc"); else { setPSort(key); setPDir("desc"); } };

  const sortedPartners = useMemo(() => {
    let data = [...topPartners];
    if (searchPartner) {
      const q = searchPartner.toLowerCase();
      data = data.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    return data.sort((a, b) => {
      const av = (a as any)[pSort]; const bv = (b as any)[pSort];
      if (typeof av === "string") return pDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return pDir === "asc" ? av - bv : bv - av;
    });
  }, [pSort, pDir, searchPartner, topPartners]);

  if (loading) {
    return (
      <div>
        <h2 className="font-display text-[22px] font-bold mb-1.5">Reports & Analytics</h2>
        <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-6">Loading analytics...</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-3 w-20 bg-[var(--app-border)] rounded mb-3" />
              <div className="h-7 w-24 bg-[var(--app-border)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const s = stats || {
    totalPipeline: 0,
    totalCommissionsPaid: 0,
    totalCommissionsDue: 0,
    totalCommissionsPending: 0,
    totalPartners: 0,
    activePartners: 0,
    newPartnersThisMonth: 0,
    conversionRate: 0,
  };

  const sectionRenderers: Record<SectionId, () => JSX.Element> = {
    keyMetrics: () => (
      <section
        key="keyMetrics"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "keyMetrics")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "keyMetrics")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Key Metrics — drag to reorder</div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Pipeline", value: fmt$(s.totalPipeline), color: "text-[var(--app-text)]" },
            { label: "Commissions Paid", value: fmt$(s.totalCommissionsPaid), color: "text-green-400" },
            { label: "Commissions Due", value: fmt$(s.totalCommissionsDue), color: "text-blue-400" },
            { label: "Commissions Pending", value: fmt$(s.totalCommissionsPending), color: "text-yellow-400" },
          ].map((m) => (
            <div key={m.label} className="stat-card">
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-2">{m.label}</div>
              <div className={`font-display text-xl sm:text-2xl font-bold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>
      </section>
    ),
    partnerStats: () => (
      <section
        key="partnerStats"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "partnerStats")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "partnerStats")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Partner Stats — drag to reorder</div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Partners", value: String(s.totalPartners) },
            { label: "Active Partners", value: String(s.activePartners) },
            { label: "New This Month", value: `+${s.newPartnersThisMonth}` },
            { label: "Conversion Rate", value: `${s.conversionRate}%` },
          ].map((m) => (
            <div key={m.label} className="stat-card">
              <div className="font-body text-[9px] tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-2">{m.label}</div>
              <div className="font-display text-xl sm:text-2xl font-bold text-brand-gold">{m.value}</div>
            </div>
          ))}
        </div>
      </section>
    ),
    monthly: () => (
      <section
        key="monthly"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "monthly")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "monthly")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Monthly Commission Report — drag to reorder</div>
        )}
        <div className="card">
        <div className="px-6 py-4 border-b border-[var(--app-border)]">
          <div className="font-body font-semibold text-sm">Monthly Commission Report</div>
        </div>
        {sortedMonthly.length === 0 ? (
          <div className="p-8 text-center">
            <div className="font-body text-sm text-[var(--app-text-muted)]">No monthly data yet. Data will appear as deals and commissions are created.</div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <div className="grid grid-cols-[1fr_0.6fr_0.6fr_0.8fr_0.8fr_0.6fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
                <SortHeader label="Month" sortKey="month" currentSort={mSort} currentDir={mDir} onSort={toggleMSort} />
                <SortHeader label="New Deals" sortKey="newDeals" currentSort={mSort} currentDir={mDir} onSort={toggleMSort} />
                <SortHeader label="Closed Won" sortKey="closedWon" currentSort={mSort} currentDir={mDir} onSort={toggleMSort} />
                <SortHeader label="Comm. Paid" sortKey="commPaid" currentSort={mSort} currentDir={mDir} onSort={toggleMSort} />
                <SortHeader label="Comm. Due" sortKey="commDue" currentSort={mSort} currentDir={mDir} onSort={toggleMSort} />
                <SortHeader label="New Partners" sortKey="newPartners" currentSort={mSort} currentDir={mDir} onSort={toggleMSort} />
              </div>
              {sortedMonthly.map((row) => (
                <div key={row.month} className="grid grid-cols-[1fr_0.6fr_0.6fr_0.8fr_0.8fr_0.6fr] gap-4 px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors">
                  <div className="font-body text-[13px] text-[var(--app-text)]">{row.month}</div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{row.newDeals}</div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{row.closedWon}</div>
                  <div className="font-body text-[13px] text-green-400 font-semibold">{fmt$(row.commPaid)}</div>
                  <div className="font-body text-[13px] text-blue-400 font-semibold">{fmt$(row.commDue)}</div>
                  <div className="font-body text-[13px] text-brand-gold">+{row.newPartners}</div>
                </div>
              ))}
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[var(--app-border)]">
              {sortedMonthly.map((row) => (
                <div key={row.month} className="px-4 py-4">
                  <div className="font-body text-sm font-medium text-[var(--app-text)] mb-2">{row.month}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="flex justify-between"><span className="font-body text-xs text-[var(--app-text-muted)]">New Deals</span><span className="font-body text-xs text-[var(--app-text-secondary)]">{row.newDeals}</span></div>
                    <div className="flex justify-between"><span className="font-body text-xs text-[var(--app-text-muted)]">Closed Won</span><span className="font-body text-xs text-[var(--app-text-secondary)]">{row.closedWon}</span></div>
                    <div className="flex justify-between"><span className="font-body text-xs text-[var(--app-text-muted)]">Comm. Paid</span><span className="font-body text-xs text-green-400 font-semibold">{fmt$(row.commPaid)}</span></div>
                    <div className="flex justify-between"><span className="font-body text-xs text-[var(--app-text-muted)]">Comm. Due</span><span className="font-body text-xs text-blue-400 font-semibold">{fmt$(row.commDue)}</span></div>
                    <div className="flex justify-between"><span className="font-body text-xs text-[var(--app-text-muted)]">New Partners</span><span className="font-body text-xs text-brand-gold">+{row.newPartners}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        </div>
      </section>
    ),
    topPartners: () => (
      <section
        key="topPartners"
        draggable={editMode}
        onDragStart={(e) => onSectionDragStart(e, "topPartners")}
        onDragOver={onSectionDragOver}
        onDrop={(e) => onSectionDrop(e, "topPartners")}
        className={`mb-6 ${editMode ? "rounded-lg ring-1 ring-brand-gold/25 p-2 cursor-move" : ""}`}
      >
        {editMode && (
          <div className="font-body text-[10px] uppercase tracking-wider theme-text-muted mb-2">⋮⋮ Top Partners by Commission — drag to reorder</div>
        )}
        <div className="card">
        <div className="px-6 py-4 border-b border-[var(--app-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="font-body font-semibold text-sm">Top Partners by Commission</div>
          <input
            value={searchPartner}
            onChange={(e) => setSearchPartner(e.target.value)}
            placeholder="Search by name or code..."
            className="w-full sm:w-64 theme-input rounded-lg px-3 py-2 font-body text-[12px] outline-none focus:border-brand-gold/40 transition-colors"
          />
        </div>
        {sortedPartners.length === 0 ? (
          <div className="p-8 text-center">
            <div className="font-body text-sm text-[var(--app-text-muted)]">No partner data yet.</div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <div className="grid grid-cols-[0.3fr_1.5fr_0.6fr_0.6fr_0.8fr_0.8fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
                <div className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">#</div>
                <SortHeader label="Partner" sortKey="name" currentSort={pSort} currentDir={pDir} onSort={togglePSort} />
                <SortHeader label="Code" sortKey="code" currentSort={pSort} currentDir={pDir} onSort={togglePSort} />
                <SortHeader label="Deals" sortKey="deals" currentSort={pSort} currentDir={pDir} onSort={togglePSort} />
                <SortHeader label="Pipeline" sortKey="pipeline" currentSort={pSort} currentDir={pDir} onSort={togglePSort} />
                <SortHeader label="Commission" sortKey="commission" currentSort={pSort} currentDir={pDir} onSort={togglePSort} />
              </div>
              {sortedPartners.map((p, i) => (
                <div key={p.code} className="grid grid-cols-[0.3fr_1.5fr_0.6fr_0.6fr_0.8fr_0.8fr] gap-4 px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors">
                  <div className={`font-display text-sm font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-[var(--app-text-muted)]"}`}>
                    {i + 1}
                  </div>
                  <PartnerLink partnerId={p.id} className="font-body text-[13px] text-[var(--app-text)]">{p.name}</PartnerLink>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-wider">{p.code}</div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{p.deals}</div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{fmt$(p.pipeline)}</div>
                  <div className="font-display text-[14px] font-semibold text-brand-gold">{fmt$(p.commission)}</div>
                </div>
              ))}
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[var(--app-border)]">
              {sortedPartners.map((p, i) => (
                <div key={p.code} className="px-4 py-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`font-display text-sm font-bold w-6 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-orange-400" : "text-[var(--app-text-muted)]"}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <PartnerLink partnerId={p.id} className="font-body text-sm font-medium text-[var(--app-text)] truncate block">{p.name}</PartnerLink>
                      <div className="font-body text-xs text-[var(--app-text-muted)] tracking-wider">{p.code}</div>
                    </div>
                    <div className="font-display text-base font-bold text-brand-gold shrink-0">{fmt$(p.commission)}</div>
                  </div>
                  <div className="flex gap-4 ml-9">
                    <div className="font-body text-xs text-[var(--app-text-muted)]">{p.deals} deals</div>
                    <div className="font-body text-xs text-[var(--app-text-muted)]">{fmt$(p.pipeline)} pipeline</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        </div>
      </section>
    ),
  };

  return (
    <div>
      <ReportingTabs />
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1.5">Reports &amp; Analytics</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">Overview of pipeline, commissions, and partner performance.</p>
        </div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`font-body text-[12px] px-3 py-2 rounded-lg border transition-colors ${
            editMode
              ? "bg-brand-gold text-black border-brand-gold font-semibold"
              : "border-[var(--app-border)] theme-text-secondary hover:bg-brand-gold/10 hover:border-brand-gold/40"
          }`}
          title="Drag to reorder sections — saved per admin via localStorage"
        >
          {editMode ? "✓ Done editing" : "✎ Edit layout"}
        </button>
      </div>

      {sectionOrder.map((id) => sectionRenderers[id]())}
    </div>
  );
}
