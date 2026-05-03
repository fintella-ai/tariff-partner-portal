"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface FunnelStats {
  funnel: {
    pageVisits: number;
    calculatorUsed: number;
    formSubmitted: number;
    inviteSent: number;
    agreementSigned: number;
    firstReferral: number;
  };
  timeBased: { thisWeek: number; thisMonth: number; allTime: number };
  split: { broker: number; referral: number };
  bookSizeDistribution: Record<string, number>;
  topUtmSources: { source: string; count: number }[];
}

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  companyName: string | null;
  partnerType: string | null;
  clientCount: string | null;
  status: string;
  additionalNotes: string | null;
  adminNotes: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string;
  partner: { partnerCode: string; status: string } | null;
}

interface BrokerPartner {
  id: string;
  partnerCode: string;
  name: string;
  email: string;
  companyName: string | null;
  partnerType: string;
  status: string;
  commissionRate: number;
  clientBookSize: string | null;
  dealsSubmitted: number;
  commissionEarned: number;
  agreementStatus: string;
  widgetInstalled: boolean;
  lastActive: string | null;
  createdAt: string;
}

type Tab = "analytics" | "leads" | "partners" | "settings";
type TimeRange = "week" | "month" | "all";
type LeadStatus = "all" | "new" | "approved" | "rejected";
type PartnerFilter = "all" | "active" | "pending";
type PartnerSort = "deals" | "commission" | "lastActive";

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function pct(a: number, b: number) {
  if (b === 0) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

/* ── Funnel Bar ────────────────────────────────────────────────────────────── */

const FUNNEL_COLORS = [
  "var(--brand-gold)",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

function FunnelBar({ label, count, maxCount, color, prevCount }: {
  label: string; count: number; maxCount: number; color: string; prevCount?: number;
}) {
  const width = maxCount > 0 ? Math.max((count / maxCount) * 100, 4) : 4;
  return (
    <div className="flex items-center gap-4">
      <div className="w-36 shrink-0 text-right">
        <span className="font-body text-xs theme-text-muted">{label}</span>
      </div>
      <div className="flex-1 flex items-center gap-3">
        <div
          className="h-9 rounded-lg flex items-center px-3 transition-all duration-500"
          style={{ width: `${width}%`, background: color, minWidth: 48 }}
        >
          <span className="font-display text-sm font-bold text-black">{count.toLocaleString()}</span>
        </div>
        {prevCount !== undefined && prevCount > 0 && (
          <span className="font-body text-[11px] theme-text-muted">
            {pct(count, prevCount)} conv.
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Status Badge ──────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    contacted: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    qualified: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    approved: "bg-green-500/20 text-green-300 border-green-500/30",
    rejected: "bg-red-500/20 text-red-300 border-red-500/30",
    active: "bg-green-500/20 text-green-300 border-green-500/30",
    pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    signed: "bg-green-500/20 text-green-300 border-green-500/30",
    not_sent: "bg-gray-500/20 text-gray-300 border-gray-500/30",
    none: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] || styles.new}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

export default function BrokerFunnelPage() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [loading, setLoading] = useState(true);

  // Analytics state
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  // Leads state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadPage, setLeadPage] = useState(1);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  // Partners state
  const [partners, setPartners] = useState<BrokerPartner[]>([]);
  const [partnersTotal, setPartnersTotal] = useState(0);
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>("all");
  const [partnerSort, setPartnerSort] = useState<PartnerSort>("deals");
  const [partnerPage, setPartnerPage] = useState(1);

  // Clipboard state
  const [copied, setCopied] = useState<string | null>(null);

  // ── Fetch stats ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/broker-funnel/stats?range=${timeRange}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [timeRange]);

  // ── Fetch leads ──────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: leadStatus,
        search: leadSearch,
        page: String(leadPage),
      });
      const res = await fetch(`/api/admin/broker-funnel/leads?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setLeadsTotal(data.total || 0);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [leadStatus, leadSearch, leadPage]);

  // ── Fetch partners ───────────────────────────────────────────────────────
  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filter: partnerFilter,
        sort: partnerSort,
        page: String(partnerPage),
      });
      const res = await fetch(`/api/admin/broker-funnel/partners?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPartners(data.partners || []);
        setPartnersTotal(data.total || 0);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [partnerFilter, partnerSort, partnerPage]);

  useEffect(() => {
    if (tab === "analytics") fetchStats();
    else if (tab === "leads") fetchLeads();
    else if (tab === "partners") fetchPartners();
    else setLoading(false);
  }, [tab, fetchStats, fetchLeads, fetchPartners]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  /* ── Tab buttons ────────────────────────────────────────────────────────── */
  const tabs: { id: Tab; label: string }[] = [
    { id: "analytics", label: "Funnel Analytics" },
    { id: "leads", label: "Leads" },
    { id: "partners", label: "Active Partners" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">Broker Funnel</h2>
        <p className="font-body text-sm theme-text-muted">
          Analytics, lead management, and partner tracking for the customs broker funnel.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 rounded-lg font-body text-sm whitespace-nowrap transition-all min-h-[44px] ${
              tab === t.id
                ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                : "theme-text-secondary hover:bg-[var(--app-hover)] border border-transparent"
            }`}
          >
            {t.label}
            {t.id === "leads" && leadsTotal > 0 && (
              <span className="ml-1.5 text-[10px] bg-brand-gold/20 text-brand-gold px-1.5 py-0.5 rounded-full">
                {leadsTotal}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-gold/30 border-t-brand-gold rounded-full animate-spin" />
        </div>
      )}

      {/* ─── TAB 1: FUNNEL ANALYTICS ─────────────────────────────────────── */}
      {!loading && tab === "analytics" && stats && (
        <div className="space-y-6">
          {/* Time range toggle */}
          <div className="flex gap-2">
            {(["week", "month", "all"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg font-body text-xs transition-all min-h-[36px] ${
                  timeRange === r
                    ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                    : "theme-text-secondary hover:bg-[var(--app-hover)] border border-[var(--app-border)]"
                }`}
              >
                {r === "week" ? "This Week" : r === "month" ? "This Month" : "All Time"}
              </button>
            ))}
          </div>

          {/* Stat cards row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="font-body text-[11px] theme-text-muted uppercase tracking-wider mb-1">This Week</div>
              <div className="font-display text-2xl font-bold">{stats.timeBased.thisWeek}</div>
            </div>
            <div className="card p-4">
              <div className="font-body text-[11px] theme-text-muted uppercase tracking-wider mb-1">This Month</div>
              <div className="font-display text-2xl font-bold">{stats.timeBased.thisMonth}</div>
            </div>
            <div className="card p-4">
              <div className="font-body text-[11px] theme-text-muted uppercase tracking-wider mb-1">All Time</div>
              <div className="font-display text-2xl font-bold">{stats.timeBased.allTime}</div>
            </div>
          </div>

          {/* Funnel visualization */}
          <div className="card p-6">
            <h3 className="font-display text-base font-bold mb-5">Conversion Funnel</h3>
            <div className="space-y-3">
              {([
                { label: "Page Visits", key: "pageVisits" },
                { label: "Calculator Used", key: "calculatorUsed" },
                { label: "Form Submitted", key: "formSubmitted" },
                { label: "Invite Sent", key: "inviteSent" },
                { label: "Agreement Signed", key: "agreementSigned" },
                { label: "First Referral", key: "firstReferral" },
              ] as const).map((stage, i, arr) => {
                const count = stats.funnel[stage.key];
                const prevCount = i > 0 ? stats.funnel[arr[i - 1].key] : undefined;
                return (
                  <FunnelBar
                    key={stage.key}
                    label={stage.label}
                    count={count}
                    maxCount={stats.funnel.pageVisits || 1}
                    color={FUNNEL_COLORS[i]}
                    prevCount={prevCount}
                  />
                );
              })}
            </div>
            {stats.funnel.pageVisits > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--app-border)]">
                <span className="font-body text-xs theme-text-muted">
                  Overall conversion: Page Visit to First Referral ={" "}
                  <span className="text-brand-gold font-medium">
                    {pct(stats.funnel.firstReferral, stats.funnel.pageVisits)}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Bottom row: split + distribution + UTM */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Broker vs Referral split */}
            <div className="card p-5">
              <h3 className="font-display text-sm font-bold mb-4">Application Type Split</h3>
              {(() => {
                const total = stats.split.broker + stats.split.referral;
                const bPct = total > 0 ? Math.round((stats.split.broker / total) * 100) : 0;
                const rPct = 100 - bPct;
                return (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between font-body text-xs mb-1">
                        <span>Broker</span>
                        <span className="text-brand-gold">{stats.split.broker} ({bPct}%)</span>
                      </div>
                      <div className="h-3 rounded-full bg-[var(--app-hover)] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${bPct}%`, background: "var(--brand-gold)" }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between font-body text-xs mb-1">
                        <span>Referral</span>
                        <span className="theme-text-muted">{stats.split.referral} ({rPct}%)</span>
                      </div>
                      <div className="h-3 rounded-full bg-[var(--app-hover)] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500 bg-blue-500/60" style={{ width: `${rPct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Client book size distribution */}
            <div className="card p-5">
              <h3 className="font-display text-sm font-bold mb-4">Client Book Size</h3>
              <div className="space-y-2">
                {Object.entries(stats.bookSizeDistribution).map(([range, count]) => {
                  const maxVal = Math.max(...Object.values(stats.bookSizeDistribution), 1);
                  return (
                    <div key={range} className="flex items-center gap-3">
                      <span className="font-body text-xs theme-text-muted w-12 text-right shrink-0">{range}</span>
                      <div className="flex-1 h-6 rounded bg-[var(--app-hover)] overflow-hidden">
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{
                            width: `${Math.max((count / maxVal) * 100, 2)}%`,
                            background: "var(--brand-gold)",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <span className="font-body text-xs font-medium w-8">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top UTM sources */}
            <div className="card p-5">
              <h3 className="font-display text-sm font-bold mb-4">Top UTM Sources</h3>
              {stats.topUtmSources.length === 0 ? (
                <p className="font-body text-xs theme-text-muted">No UTM data yet.</p>
              ) : (
                <div className="space-y-2">
                  {stats.topUtmSources.slice(0, 6).map((u, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="font-body text-xs">{u.source}</span>
                      <span className="font-body text-xs font-medium text-brand-gold">{u.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: LEADS ────────────────────────────────────────────────── */}
      {!loading && tab === "leads" && (
        <div className="space-y-4">
          {/* Filters row */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Status filter */}
            <div className="flex gap-1">
              {(["all", "new", "approved", "rejected"] as LeadStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => { setLeadStatus(s); setLeadPage(1); }}
                  className={`px-3 py-1.5 rounded-lg font-body text-xs transition-all min-h-[36px] capitalize ${
                    leadStatus === s
                      ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                      : "theme-text-secondary hover:bg-[var(--app-hover)] border border-[var(--app-border)]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {/* Search */}
            <input
              type="text"
              placeholder="Search name, email, company..."
              value={leadSearch}
              onChange={(e) => { setLeadSearch(e.target.value); setLeadPage(1); }}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg font-body text-sm border border-[var(--app-border)] bg-[var(--app-bg-secondary)] theme-text min-h-[36px] focus:outline-none focus:border-brand-gold/50"
            />
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--app-border)]">
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden sm:table-cell">Company</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden md:table-cell">Type</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden md:table-cell">Clients</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden lg:table-cell">Applied</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center font-body text-sm theme-text-muted">
                        No broker leads found.
                      </td>
                    </tr>
                  )}
                  {leads.map((lead) => (
                    <>
                      <tr
                        key={lead.id}
                        onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                        className="border-b border-[var(--app-border)] hover:bg-[var(--app-hover)] cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-body text-sm">
                          {lead.firstName} {lead.lastName}
                        </td>
                        <td className="px-4 py-3 font-body text-xs theme-text-muted">{lead.email}</td>
                        <td className="px-4 py-3 font-body text-xs hidden sm:table-cell">{lead.companyName || "-"}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {lead.partnerType === "broker" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-gold/20 text-brand-gold border border-brand-gold/30">
                              Broker
                            </span>
                          )}
                          {lead.partnerType !== "broker" && (
                            <span className="font-body text-xs theme-text-muted">Referral</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-body text-xs hidden md:table-cell">{lead.clientCount || "-"}</td>
                        <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                        <td className="px-4 py-3 font-body text-xs theme-text-muted hidden lg:table-cell">{formatDate(lead.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {lead.partner && (
                              <a
                                href={`/admin/partners?code=${lead.partner.partnerCode}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-body text-[11px] text-brand-gold hover:underline px-2 py-1 rounded min-h-[32px] flex items-center"
                              >
                                View Partner
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expanded details */}
                      {expandedLead === lead.id && (
                        <tr key={`${lead.id}-detail`} className="bg-[var(--app-bg-secondary)]">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-body text-xs">
                              {lead.additionalNotes && (
                                <div className="sm:col-span-2">
                                  <span className="theme-text-muted">Additional Notes:</span>
                                  <p className="mt-1 theme-text">{lead.additionalNotes}</p>
                                </div>
                              )}
                              {lead.adminNotes && (
                                <div className="sm:col-span-2">
                                  <span className="theme-text-muted">Admin Notes:</span>
                                  <p className="mt-1 theme-text">{lead.adminNotes}</p>
                                </div>
                              )}
                              {lead.utmSource && (
                                <div>
                                  <span className="theme-text-muted">UTM Source:</span>
                                  <span className="ml-2">{lead.utmSource}</span>
                                </div>
                              )}
                              {lead.utmMedium && (
                                <div>
                                  <span className="theme-text-muted">UTM Medium:</span>
                                  <span className="ml-2">{lead.utmMedium}</span>
                                </div>
                              )}
                              {lead.utmCampaign && (
                                <div>
                                  <span className="theme-text-muted">UTM Campaign:</span>
                                  <span className="ml-2">{lead.utmCampaign}</span>
                                </div>
                              )}
                              <div>
                                <span className="theme-text-muted">Client Count:</span>
                                <span className="ml-2">{lead.clientCount || "Not specified"}</span>
                              </div>
                              <div>
                                <span className="theme-text-muted">Partner Type:</span>
                                <span className="ml-2">{lead.partnerType || "Not specified"}</span>
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
            {/* Pagination */}
            {leadsTotal > 50 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--app-border)]">
                <span className="font-body text-xs theme-text-muted">
                  Showing {(leadPage - 1) * 50 + 1}-{Math.min(leadPage * 50, leadsTotal)} of {leadsTotal}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLeadPage(Math.max(1, leadPage - 1))}
                    disabled={leadPage === 1}
                    className="px-3 py-1.5 rounded font-body text-xs border border-[var(--app-border)] disabled:opacity-30 hover:bg-[var(--app-hover)] min-h-[32px]"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setLeadPage(leadPage + 1)}
                    disabled={leadPage * 50 >= leadsTotal}
                    className="px-3 py-1.5 rounded font-body text-xs border border-[var(--app-border)] disabled:opacity-30 hover:bg-[var(--app-hover)] min-h-[32px]"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 3: ACTIVE PARTNERS ──────────────────────────────────────── */}
      {!loading && tab === "partners" && (
        <div className="space-y-4">
          {/* Filters row */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-1">
              {(["all", "active", "pending"] as PartnerFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => { setPartnerFilter(f); setPartnerPage(1); }}
                  className={`px-3 py-1.5 rounded-lg font-body text-xs transition-all min-h-[36px] capitalize ${
                    partnerFilter === f
                      ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                      : "theme-text-secondary hover:bg-[var(--app-hover)] border border-[var(--app-border)]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto">
              <span className="font-body text-xs theme-text-muted self-center mr-1">Sort:</span>
              {([
                { id: "deals" as PartnerSort, label: "Deals" },
                { id: "commission" as PartnerSort, label: "Commission" },
                { id: "lastActive" as PartnerSort, label: "Last Active" },
              ]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setPartnerSort(s.id)}
                  className={`px-3 py-1.5 rounded-lg font-body text-xs transition-all min-h-[36px] ${
                    partnerSort === s.id
                      ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                      : "theme-text-secondary hover:bg-[var(--app-hover)] border border-[var(--app-border)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--app-border)]">
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden sm:table-cell">Code</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden md:table-cell">Company</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden lg:table-cell">Clients</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider">Deals</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden sm:table-cell">Commission</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden md:table-cell">Agreement</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden lg:table-cell">Widget</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-body text-[11px] theme-text-muted uppercase tracking-wider hidden lg:table-cell">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center font-body text-sm theme-text-muted">
                        No broker partners found.
                      </td>
                    </tr>
                  )}
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--app-border)] hover:bg-[var(--app-hover)] transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/admin/partners?code=${p.partnerCode}`} className="font-body text-sm hover:text-brand-gold transition-colors">
                          {p.name}
                        </a>
                      </td>
                      <td className="px-4 py-3 font-body text-xs font-mono theme-text-muted hidden sm:table-cell">{p.partnerCode}</td>
                      <td className="px-4 py-3 font-body text-xs hidden md:table-cell">{p.companyName || "-"}</td>
                      <td className="px-4 py-3 font-body text-xs hidden lg:table-cell">{p.clientBookSize || "-"}</td>
                      <td className="px-4 py-3 font-body text-sm font-medium">{p.dealsSubmitted}</td>
                      <td className="px-4 py-3 font-body text-sm text-brand-gold hidden sm:table-cell">{formatCurrency(p.commissionEarned)}</td>
                      <td className="px-4 py-3 hidden md:table-cell"><StatusBadge status={p.agreementStatus} /></td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {p.widgetInstalled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                            Installed
                          </span>
                        ) : (
                          <span className="font-body text-xs theme-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 font-body text-xs theme-text-muted hidden lg:table-cell">
                        {p.lastActive ? formatDate(p.lastActive) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {partnersTotal > 50 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--app-border)]">
                <span className="font-body text-xs theme-text-muted">
                  Showing {(partnerPage - 1) * 50 + 1}-{Math.min(partnerPage * 50, partnersTotal)} of {partnersTotal}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPartnerPage(Math.max(1, partnerPage - 1))}
                    disabled={partnerPage === 1}
                    className="px-3 py-1.5 rounded font-body text-xs border border-[var(--app-border)] disabled:opacity-30 hover:bg-[var(--app-hover)] min-h-[32px]"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPartnerPage(partnerPage + 1)}
                    disabled={partnerPage * 50 >= partnersTotal}
                    className="px-3 py-1.5 rounded font-body text-xs border border-[var(--app-border)] disabled:opacity-30 hover:bg-[var(--app-hover)] min-h-[32px]"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 4: SETTINGS ─────────────────────────────────────────────── */}
      {!loading && tab === "settings" && (
        <div className="space-y-4 max-w-2xl">
          {/* Landing page URL */}
          <div className="card p-5">
            <h3 className="font-display text-sm font-bold mb-3">Landing Page URL</h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-body text-xs bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 theme-text-muted overflow-x-auto">
                https://fintella.partners/partners/brokers
              </code>
              <button
                onClick={() => copyToClipboard("https://fintella.partners/partners/brokers", "landing")}
                className="px-3 py-2.5 rounded-lg font-body text-xs border border-[var(--app-border)] hover:bg-brand-gold/10 hover:text-brand-gold transition-colors min-h-[40px] shrink-0"
              >
                {copied === "landing" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Google Ads URL */}
          <div className="card p-5">
            <h3 className="font-display text-sm font-bold mb-3">Google Ads Campaign URL</h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-body text-xs bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 theme-text-muted overflow-x-auto">
                https://fintella.partners/partners/brokers?utm_source=google&utm_medium=cpc&utm_campaign=broker_recruitment
              </code>
              <button
                onClick={() => copyToClipboard(
                  "https://fintella.partners/partners/brokers?utm_source=google&utm_medium=cpc&utm_campaign=broker_recruitment",
                  "ads"
                )}
                className="px-3 py-2.5 rounded-lg font-body text-xs border border-[var(--app-border)] hover:bg-brand-gold/10 hover:text-brand-gold transition-colors min-h-[40px] shrink-0"
              >
                {copied === "ads" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Commission rate */}
          <div className="card p-5">
            <h3 className="font-display text-sm font-bold mb-3">Broker Commission Rate</h3>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center font-display text-2xl font-bold text-brand-gold" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
                25%
              </div>
              <p className="font-body text-xs theme-text-muted leading-relaxed">
                Default commission rate for customs broker partners. Brokers receive 25% of the firm fee on each successful referral they submit through the portal.
              </p>
            </div>
          </div>

          {/* Auto-approve toggle */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold mb-1">Auto-Approve Broker Applications</h3>
                <p className="font-body text-xs theme-text-muted">
                  When enabled, broker applications are automatically approved and invited without manual review.
                </p>
              </div>
              <div className="ml-4">
                <div
                  className="w-12 h-7 rounded-full relative cursor-pointer transition-colors"
                  style={{
                    background: "var(--app-border)",
                    opacity: 0.6,
                  }}
                  title="Coming soon"
                >
                  <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform" />
                </div>
                <span className="font-body text-[10px] theme-text-muted block mt-1 text-center">Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
