"use client";

import { useState, useMemo } from "react";
import { fmt$ } from "@/lib/format";

type SortDir = "asc" | "desc";

function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: {
  label: string; sortKey: string; currentSort: string; currentDir: SortDir; onSort: (key: string) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button onClick={() => onSort(sortKey)} className="flex items-center gap-1 font-body text-[10px] tracking-[1px] uppercase theme-text-muted hover:text-brand-gold transition-colors text-left">
      {label}
      <span className={`text-[8px] flex flex-col leading-none ${isActive ? "text-brand-gold" : "theme-text-faint"}`}>
        <span className={isActive && currentDir === "asc" ? "text-brand-gold" : ""}>&#9650;</span>
        <span className={isActive && currentDir === "desc" ? "text-brand-gold" : ""}>&#9660;</span>
      </span>
    </button>
  );
}

const MONTHS = ["All Data", "Mar 2025", "Feb 2025", "Jan 2025", "Dec 2024", "Nov 2024"];

const DEMO_STATS = {
  totalPipeline: 1850000,
  totalCommissionsPaid: 42600,
  totalCommissionsDue: 18730,
  totalCommissionsPending: 67400,
  totalPartners: 24,
  activePartners: 18,
  newPartnersThisMonth: 4,
  dealsThisMonth: 12,
  closedWonThisMonth: 3,
  conversionRate: 25,
};

const TOP_PARTNERS = [
  { name: "John Orlando", code: "TEST99", deals: 3, pipeline: 335000, commission: 13400 },
  { name: "Sarah Chen", code: "PTNSC8K2F", deals: 2, pipeline: 220000, commission: 4400 },
  { name: "Mike Torres", code: "PTNMT3X7Q", deals: 2, pipeline: 185000, commission: 3700 },
  { name: "Lisa Park", code: "PTNLP9W4R", deals: 1, pipeline: 95000, commission: 1900 },
  { name: "David Kim", code: "PTNDK4R7S", deals: 1, pipeline: 78000, commission: 1560 },
];

const MONTHLY_DATA = [
  { month: "Mar 2025", newDeals: 12, closedWon: 3, commPaid: 14200, commDue: 18730, newPartners: 4 },
  { month: "Feb 2025", newDeals: 9, closedWon: 2, commPaid: 9800, commDue: 12400, newPartners: 3 },
  { month: "Jan 2025", newDeals: 7, closedWon: 2, commPaid: 8200, commDue: 9600, newPartners: 2 },
  { month: "Dec 2024", newDeals: 5, closedWon: 1, commPaid: 5400, commDue: 6800, newPartners: 2 },
  { month: "Nov 2024", newDeals: 4, closedWon: 1, commPaid: 5000, commDue: 4200, newPartners: 1 },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState("All Data");
  const [searchPartner, setSearchPartner] = useState("");
  const s = DEMO_STATS;

  // Monthly table sorting
  const [mSort, setMSort] = useState("month");
  const [mDir, setMDir] = useState<SortDir>("desc");
  const toggleMSort = (key: string) => { if (mSort === key) setMDir(mDir === "asc" ? "desc" : "asc"); else { setMSort(key); setMDir("asc"); } };

  const sortedMonthly = useMemo(() => [...MONTHLY_DATA].sort((a, b) => {
    const av = (a as any)[mSort]; const bv = (b as any)[mSort];
    if (typeof av === "string") return mDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return mDir === "asc" ? av - bv : bv - av;
  }), [mSort, mDir]);

  // Top partners sorting
  const [pSort, setPSort] = useState("commission");
  const [pDir, setPDir] = useState<SortDir>("desc");
  const togglePSort = (key: string) => { if (pSort === key) setPDir(pDir === "asc" ? "desc" : "asc"); else { setPSort(key); setPDir("desc"); } };

  const sortedPartners = useMemo(() => {
    let data = [...TOP_PARTNERS];
    if (searchPartner) {
      const q = searchPartner.toLowerCase();
      data = data.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    }
    return data.sort((a, b) => {
      const av = (a as any)[pSort]; const bv = (b as any)[pSort];
      if (typeof av === "string") return pDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return pDir === "asc" ? av - bv : bv - av;
    });
  }, [pSort, pDir, searchPartner]);

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1.5">Reports & Analytics</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">Overview of pipeline, commissions, and partner performance.</p>
        </div>
        <div className="flex gap-2">
          <select
            className="bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 text-[var(--app-text)] font-body text-[12px] outline-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="font-body text-[11px] tracking-[1px] uppercase text-brand-gold/70 border border-brand-gold/20 rounded-lg px-4 py-2 hover:bg-brand-gold/10 transition-colors">
            Export PDF
          </button>
        </div>
      </div>

      {/* ═══ KEY METRICS ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      {/* ═══ MONTHLY TRENDS ═══ */}
      <div className="card mb-6">
        <div className="px-6 py-4 border-b border-[var(--app-border)]">
          <div className="font-body font-semibold text-sm">Monthly Commission Report</div>
        </div>
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

      {/* ═══ TOP PARTNERS ═══ */}
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
            <div className="font-body text-[13px] text-[var(--app-text)]">{p.name}</div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-wider">{p.code}</div>
            <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{p.deals}</div>
            <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{fmt$(p.pipeline)}</div>
            <div className="font-display text-[14px] font-semibold text-brand-gold">{fmt$(p.commission)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
