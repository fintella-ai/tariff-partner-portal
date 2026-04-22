"use client";

import { useState, useEffect, useCallback } from "react";
import { fmt$ } from "@/lib/format";
import PartnerLink from "@/components/ui/PartnerLink";
import DealLink from "@/components/ui/DealLink";
import ReportingTabs from "@/components/ui/ReportingTabs";
import { useSession } from "next-auth/react";

type SubTab = "Custom Commissions" | "Enterprise Reporting";

type EnterprisePartnerData = {
  id: string;
  partnerCode: string;
  partnerId: string | null;
  partnerName: string;
  companyName: string | null;
  totalRate: number;
  overrideRate: number;
  applyToAll: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
  overrides: {
    id: string;
    l1PartnerCode: string;
    l1PartnerId: string | null;
    l1PartnerName: string;
    l1PartnerStatus: string;
    status: string;
    createdAt: string;
  }[];
  summary: {
    totalDeals: number;
    totalDealAmount: number;
    totalFirmFees: number;
    totalOverrideEarnings: number;
    closedWonDeals: number;
  };
  dealBreakdown: {
    id: string;
    dealName: string;
    partnerCode: string;
    partnerName: string;
    stage: string;
    dealAmount: number;
    firmFee: number;
    fintellaGross: number;
    l1Commission: number;
    overrideAmount: number;
    fintellaNetAfterEnterprise: number;
    createdAt: string;
  }[];
};

export default function CustomCommissionsPage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";
  const [subTab, setSubTab] = useState<SubTab>("Custom Commissions");

  const [enterprises, setEnterprises] = useState<EnterprisePartnerData[]>([]);
  const [epLoading, setEpLoading] = useState(true);
  const [showAddEP, setShowAddEP] = useState(false);
  const [newEPCode, setNewEPCode] = useState("");
  const [newEPRate, setNewEPRate] = useState("2");
  const [newEPNotes, setNewEPNotes] = useState("");
  const [newEPApplyAll, setNewEPApplyAll] = useState(false);
  const [epSubmitting, setEpSubmitting] = useState(false);
  const [addOverrideFor, setAddOverrideFor] = useState<string | null>(null);
  const [newL1Code, setNewL1Code] = useState("");
  const [expandedEP, setExpandedEP] = useState<string | null>(null);

  const fetchEnterprises = useCallback(() => {
    setEpLoading(true);
    fetch("/api/admin/enterprise")
      .then((r) => r.json())
      .then((data) => setEnterprises(data.enterprises || []))
      .catch(() => {})
      .finally(() => setEpLoading(false));
  }, []);

  useEffect(() => {
    fetchEnterprises();
  }, [fetchEnterprises]);

  return (
    <div>
      <ReportingTabs />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Custom Commissions</h2>
          <p className="font-body text-[13px] theme-text-muted">
            Configure enterprise partner overrides and review deal-level enterprise payout breakdowns.
          </p>
        </div>
      </div>

      {/* ═══ SUB-TABS ═══ */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(["Custom Commissions", "Enterprise Reporting"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              subTab === t
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ═══ CUSTOM COMMISSIONS TAB ═══ */}
      {subTab === "Custom Commissions" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-lg font-bold mb-1">Enterprise Partners</h3>
              <p className="font-body text-[13px] theme-text-muted">
                Enterprise partners earn a flat override percentage on top of whatever each partner&rsquo;s own L1/L2/L3 waterfall pays. Works cleanly across partners on any rate — a 2% override totals 22% under a 20% L1, 27% under a 25%, 30% under a 28%.
              </p>
            </div>
            {isSuperAdmin && (
              <button onClick={() => setShowAddEP(!showAddEP)} className="btn-gold text-[12px] px-4 py-2.5 shrink-0">
                {showAddEP ? "Cancel" : "+ Add Enterprise Partner"}
              </button>
            )}
          </div>

          {!isSuperAdmin && (
            <div className="card p-6 text-center mb-6">
              <div className="font-body text-sm theme-text-muted">Only super admins can manage enterprise partners. Contact your super admin for changes.</div>
            </div>
          )}

          {/* Add Enterprise Partner form */}
          {showAddEP && isSuperAdmin && (
            <div className="card p-5 mb-6">
              <div className="font-body font-semibold text-sm mb-4">Add New Enterprise Partner</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-secondary mb-2 block">Partner Code *</label>
                  <input
                    className="w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors"
                    placeholder="e.g. PTN4R7K9X"
                    value={newEPCode}
                    onChange={(e) => setNewEPCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-secondary mb-2 block">Override Rate *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors"
                      placeholder="2"
                      value={newEPRate}
                      onChange={(e) => setNewEPRate(e.target.value)}
                      min="0.01"
                      max="99"
                      step="0.01"
                    />
                    <span className="font-body text-sm theme-text-muted shrink-0">%</span>
                  </div>
                  <div className="font-body text-[10px] theme-text-muted mt-1">
                    Added on top of each partner&rsquo;s existing rate. e.g. 2% override on an L1 at 25% totals 27%; on an L1 at 28% totals 30%.
                  </div>
                </div>
                <div>
                  <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-secondary mb-2 block">Notes</label>
                  <input
                    className="w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors"
                    placeholder="Optional notes..."
                    value={newEPNotes}
                    onChange={(e) => setNewEPNotes(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEPApplyAll}
                  onChange={(e) => setNewEPApplyAll(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--app-border)] accent-brand-gold"
                />
                <div>
                  <div className="font-body text-sm text-[var(--app-text)]">Apply to All Partners</div>
                  <div className="font-body text-[11px] theme-text-muted">Override applies to ALL partner deals in the portal (no need to add individual partner codes)</div>
                </div>
              </label>
              <button
                onClick={async () => {
                  if (!newEPCode.trim()) return alert("Partner code is required");
                  const rate = parseFloat(newEPRate);
                  if (isNaN(rate) || rate <= 0 || rate >= 100) return alert("Override rate must be between 0% and 100%");
                  setEpSubmitting(true);
                  try {
                    const res = await fetch("/api/admin/enterprise", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "create", partnerCode: newEPCode.trim(), overrideRate: rate / 100, applyToAll: newEPApplyAll, notes: newEPNotes || null }),
                    });
                    const data = await res.json();
                    if (!res.ok) { alert(data.error || "Failed"); return; }
                    setShowAddEP(false);
                    setNewEPCode("");
                    setNewEPRate("2");
                    setNewEPNotes("");
                    setNewEPApplyAll(false);
                    fetchEnterprises();
                  } catch { alert("Network error"); }
                  finally { setEpSubmitting(false); }
                }}
                disabled={epSubmitting}
                className="btn-gold text-sm px-6 py-2 disabled:opacity-50"
              >
                {epSubmitting ? "Creating..." : "Create Enterprise Partner"}
              </button>
            </div>
          )}

          {/* Enterprise Partners List */}
          {epLoading ? (
            <div className="card p-8 text-center"><div className="font-body text-sm theme-text-muted">Loading enterprise partners...</div></div>
          ) : enterprises.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="font-body text-sm theme-text-muted">No enterprise partners yet.</div>
              {isSuperAdmin && <div className="font-body text-xs theme-text-faint mt-2">Click &quot;Add Enterprise Partner&quot; to create one.</div>}
            </div>
          ) : (
            <div className="space-y-4">
              {enterprises.map((ep) => (
                <div key={ep.id} className="card">
                  {/* Enterprise Partner Header */}
                  <div className="px-5 py-4 border-b border-[var(--app-border)] cursor-pointer" onClick={() => setExpandedEP(expandedEP === ep.id ? null : ep.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <PartnerLink partnerId={ep.partnerId} className="font-body text-[15px] font-semibold text-[var(--app-text)]">
                            {ep.partnerName}
                          </PartnerLink>
                          <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${
                            ep.status === "terminated"
                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                              : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                          }`}>
                            {ep.status === "terminated" ? "Terminated" : "Enterprise"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs theme-text-muted">
                          <span>{ep.partnerCode}</span>
                          <span>&middot;</span>
                          <span className="text-purple-400 font-semibold">+{Math.round(ep.overrideRate * 10000) / 100}% override</span>
                          <span>&middot;</span>
                          <span>{ep.applyToAll ? "All Partners" : `${ep.overrides.filter((o) => o.status === "active").length} L1 partners`}</span>
                          {ep.applyToAll && <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase bg-green-500/10 text-green-400 border border-green-500/20 ml-1">GLOBAL</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display text-lg font-bold text-brand-gold">{fmt$(ep.summary.totalOverrideEarnings)}</div>
                        <div className="font-body text-[10px] theme-text-muted">override earnings</div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedEP === ep.id && (
                    <div className="px-5 py-4">
                      {/* Apply to All toggle (for existing EP) */}
                      {isSuperAdmin && (
                        <label className="flex items-center gap-3 mb-4 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ep.applyToAll}
                            onChange={async (e) => {
                              await fetch("/api/admin/enterprise", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "update", partnerCode: ep.partnerCode, applyToAll: e.target.checked }),
                              });
                              fetchEnterprises();
                            }}
                            className="w-4 h-4 rounded border-[var(--app-border)] accent-brand-gold"
                          />
                          <div>
                            <div className="font-body text-sm text-[var(--app-text)]">Apply to All Partners</div>
                            <div className="font-body text-[11px] theme-text-muted">Override on ALL partner deals in the portal</div>
                          </div>
                        </label>
                      )}

                      {/* Assigned L1 Partners (hidden when applyToAll) */}
                      {!ep.applyToAll && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-body text-[11px] tracking-[1.5px] uppercase theme-text-muted">Assigned L1 Partners</div>
                          {isSuperAdmin && (
                            <button onClick={() => setAddOverrideFor(addOverrideFor === ep.partnerCode ? null : ep.partnerCode)} className="font-body text-[11px] text-brand-gold hover:underline">
                              + Add L1 Partner
                            </button>
                          )}
                        </div>

                        {/* Add L1 form */}
                        {addOverrideFor === ep.partnerCode && isSuperAdmin && (
                          <div className="flex gap-2 mb-3">
                            <input
                              className="flex-1 theme-input rounded-lg px-3 py-2 font-body text-sm outline-none focus:border-brand-gold/40"
                              placeholder="L1 Partner Code..."
                              value={newL1Code}
                              onChange={(e) => setNewL1Code(e.target.value.toUpperCase())}
                            />
                            <button
                              onClick={async () => {
                                if (!newL1Code.trim()) return;
                                try {
                                  const res = await fetch("/api/admin/enterprise", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "add_override", enterprisePartnerCode: ep.partnerCode, l1PartnerCode: newL1Code.trim() }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) { alert(data.error || "Failed"); return; }
                                  setNewL1Code("");
                                  setAddOverrideFor(null);
                                  fetchEnterprises();
                                } catch { alert("Network error"); }
                              }}
                              className="btn-gold text-xs px-4 py-2"
                            >
                              Add
                            </button>
                          </div>
                        )}

                        {ep.overrides.filter((o) => o.status === "active").length === 0 ? (
                          <div className="font-body text-xs theme-text-muted py-2">No L1 partners assigned yet.</div>
                        ) : (
                          <div className="space-y-1">
                            {ep.overrides.filter((o) => o.status === "active").map((o) => (
                              <div key={o.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--app-card-bg)] transition-colors">
                                <div className="flex items-center gap-3">
                                  <PartnerLink partnerId={o.l1PartnerId} className="font-body text-sm text-[var(--app-text)]">
                                    {o.l1PartnerName}
                                  </PartnerLink>
                                  <span className="font-body text-[10px] theme-text-muted tracking-wider">{o.l1PartnerCode}</span>
                                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] tracking-wider uppercase ${
                                    o.l1PartnerStatus === "active" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                                  }`}>
                                    {o.l1PartnerStatus}
                                  </span>
                                </div>
                                {isSuperAdmin && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Remove ${o.l1PartnerName} from ${ep.partnerName}'s enterprise overrides?`)) return;
                                      await fetch("/api/admin/enterprise", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ action: "remove_override", overrideId: o.id }),
                                      });
                                      fetchEnterprises();
                                    }}
                                    className="font-body text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      )}

                      {ep.applyToAll && (
                        <div className="mb-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                          <div className="font-body text-sm text-green-400 font-semibold mb-0.5">Global Override Active</div>
                          <div className="font-body text-[11px] theme-text-muted">This enterprise partner earns a {Math.round(ep.overrideRate * 100)}% override on ALL partner deals in the portal.</div>
                        </div>
                      )}

                      {/* Summary stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        {[
                          { label: "Total Deals", value: ep.summary.totalDeals },
                          { label: "Closed Won", value: ep.summary.closedWonDeals },
                          { label: "Override Earnings", value: fmt$(ep.summary.totalOverrideEarnings), highlight: true },
                          { label: "Deal Volume", value: fmt$(ep.summary.totalDealAmount) },
                        ].map((s) => (
                          <div key={s.label} className="card px-3 py-2.5">
                            <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider mb-1">{s.label}</div>
                            <div className={`font-display text-lg font-bold ${s.highlight ? "text-purple-400" : "text-brand-gold"}`}>{s.value}</div>
                          </div>
                        ))}
                      </div>

                      {ep.notes && (
                        <div className="font-body text-xs theme-text-muted italic mb-4">Note: {ep.notes}</div>
                      )}

                      {/* Remove / Terminate actions */}
                      {isSuperAdmin && (
                        <div className="flex gap-3 pt-3 mt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
                          {ep.status === "active" && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Terminate enterprise status for ${ep.partnerName}?\n\nThis will STOP all future override tracking but KEEP all historical data and past earnings.`)) return;
                                await fetch("/api/admin/enterprise", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "update", partnerCode: ep.partnerCode, status: "terminated" }),
                                });
                                fetchEnterprises();
                              }}
                              className="font-body text-[11px] text-yellow-400 border border-yellow-400/20 rounded-lg px-4 py-2 hover:bg-yellow-400/10 transition-colors"
                            >
                              Terminate (Keep Data)
                            </button>
                          )}
                          {ep.status === "terminated" && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Reactivate enterprise status for ${ep.partnerName}?`)) return;
                                await fetch("/api/admin/enterprise", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ action: "update", partnerCode: ep.partnerCode, status: "active" }),
                                });
                                fetchEnterprises();
                              }}
                              className="font-body text-[11px] text-green-400 border border-green-400/20 rounded-lg px-4 py-2 hover:bg-green-400/10 transition-colors"
                            >
                              Reactivate
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm(`PERMANENTLY REMOVE ${ep.partnerName} as an enterprise partner?\n\nThis will DELETE all enterprise tracking data, override records, and earnings history. This cannot be undone.`)) return;
                              if (!confirm(`Are you absolutely sure? Type the partner code to confirm.\n\nThis action is IRREVERSIBLE.`)) return;
                              await fetch("/api/admin/enterprise", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "delete", partnerCode: ep.partnerCode }),
                              });
                              fetchEnterprises();
                            }}
                            className="font-body text-[11px] text-red-400/60 border border-red-400/15 rounded-lg px-4 py-2 hover:bg-red-400/10 hover:text-red-400 transition-colors"
                          >
                            Remove (Delete All Data)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ ENTERPRISE REPORTING TAB ═══ */}
      {subTab === "Enterprise Reporting" && (
        <div>
          <h3 className="font-display text-lg font-bold mb-1">Enterprise Reporting & Payouts</h3>
          <p className="font-body text-[13px] theme-text-muted mb-6">
            Deal-level breakdown showing Fintella 40% share, L1 partner commission, enterprise override, and net company profit after all payouts.
          </p>

          {epLoading ? (
            <div className="card p-8 text-center"><div className="font-body text-sm theme-text-muted">Loading...</div></div>
          ) : enterprises.filter((e) => e.status === "active").length === 0 ? (
            <div className="card p-12 text-center">
              <div className="font-body text-sm theme-text-muted">No active enterprise partners. Add one in the Custom Commissions tab.</div>
            </div>
          ) : (
            <div className="space-y-6">
              {enterprises.filter((e) => e.status === "active").map((ep) => {
                const activeDeals = ep.dealBreakdown;
                const totalOverride = ep.summary.totalOverrideEarnings;
                const totalL1Comm = activeDeals.reduce((s, d) => s + d.l1Commission, 0);
                const totalFintellaGross = activeDeals.reduce((s, d) => s + d.fintellaGross, 0);
                const totalNetAfterAll = activeDeals.reduce((s, d) => s + d.fintellaNetAfterEnterprise, 0);

                return (
                  <div key={ep.id} className="card">
                    <div className="px-5 py-4 border-b border-[var(--app-border)]">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <PartnerLink partnerId={ep.partnerId} className="font-body text-[15px] font-semibold text-[var(--app-text)]">{ep.partnerName}</PartnerLink>
                            <span className="font-body text-xs text-purple-400 font-semibold">+{Math.round(ep.overrideRate * 100)}% override</span>
                          </div>
                          <div className="font-body text-[11px] theme-text-muted mt-0.5">{ep.partnerCode} &middot; {activeDeals.length} deals across {ep.overrides.filter((o) => o.status === "active").length} L1 partners</div>
                        </div>
                      </div>
                    </div>

                    {/* Summary metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-5 py-4 border-b border-[var(--app-border)]">
                      {[
                        { label: "Fintella 40%", value: fmt$(totalFintellaGross), color: "text-brand-gold" },
                        { label: "L1 Commission", value: fmt$(totalL1Comm), color: "text-red-400" },
                        { label: `Enterprise ${Math.round(ep.overrideRate * 100)}%`, value: fmt$(totalOverride), color: "text-purple-400" },
                        { label: "Total Payout", value: fmt$(totalL1Comm + totalOverride), color: "text-orange-400" },
                        { label: "Fintella Net Profit", value: fmt$(totalNetAfterAll), color: "text-green-400" },
                      ].map((m) => (
                        <div key={m.label}>
                          <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider mb-1">{m.label}</div>
                          <div className={`font-display text-base font-bold ${m.color}`}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Deal breakdown table - Desktop */}
                    {activeDeals.length > 0 && (
                      <>
                        <div className="hidden md:block overflow-x-auto">
                          <div className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-2 px-5 py-2.5 border-b border-[var(--app-border)] min-w-[700px]">
                            {["Deal", "L1 Partner", "Firm Fee", "Fintella 40%", "L1 Comm", `EP ${Math.round(ep.overrideRate * 100)}%`, "Net"].map((h) => (
                              <div key={h} className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{h}</div>
                            ))}
                          </div>
                          {activeDeals.map((d) => (
                            <div key={d.id} className="grid grid-cols-[1.4fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr] gap-2 px-5 py-3 items-center min-w-[700px] hover:bg-[var(--app-hover)] transition-colors border-b border-[var(--app-border)] last:border-b-0">
                              <div>
                                <DealLink dealId={d.id} className="font-body text-[13px] font-medium truncate block">{d.dealName}</DealLink>
                                <div className="font-body text-[10px] theme-text-muted">{d.stage.replace("_", " ")}</div>
                              </div>
                              <PartnerLink partnerId={null} className="font-body text-[12px] theme-text-secondary truncate">{d.partnerName}</PartnerLink>
                              <div className="font-body text-[13px] theme-text-secondary">{fmt$(d.firmFee)}</div>
                              <div className="font-body text-[13px] text-brand-gold font-semibold">{fmt$(d.fintellaGross)}</div>
                              <div className="font-body text-[13px] text-red-400">-{fmt$(d.l1Commission)}</div>
                              <div className="font-body text-[13px] text-purple-400 font-semibold">-{fmt$(d.overrideAmount)}</div>
                              <div className="font-display text-[13px] font-semibold text-green-400">{fmt$(d.fintellaNetAfterEnterprise)}</div>
                            </div>
                          ))}
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden divide-y divide-[var(--app-border)]">
                          {activeDeals.map((d) => (
                            <div key={d.id} className="px-4 py-4">
                              <DealLink dealId={d.id} className="font-body text-sm font-medium text-[var(--app-text)] mb-1 block">{d.dealName}</DealLink>
                              <div className="font-body text-xs theme-text-muted mb-2">{d.partnerName} &middot; {d.stage.replace("_", " ")}</div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">Fintella 40%</span><span className="font-body text-xs text-brand-gold font-semibold">{fmt$(d.fintellaGross)}</span></div>
                                <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">L1 Comm</span><span className="font-body text-xs text-red-400">-{fmt$(d.l1Commission)}</span></div>
                                <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">EP Override</span><span className="font-body text-xs text-purple-400 font-semibold">-{fmt$(d.overrideAmount)}</span></div>
                                <div className="flex justify-between"><span className="font-body text-xs theme-text-muted">Net</span><span className="font-body text-xs text-green-400 font-semibold">{fmt$(d.fintellaNetAfterEnterprise)}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {activeDeals.length === 0 && (
                      <div className="px-5 py-8 text-center font-body text-[13px] theme-text-muted">No deals from assigned L1 partners yet.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
