"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { SkeletonTableRow } from "@/components/ui/Skeleton";
import PullToRefresh from "@/components/ui/PullToRefresh";
import { fmt$, fmtDate } from "@/lib/format";
import { STAGE_LABELS } from "@/lib/constants";

export default function DealsPage() {
  const device = useDevice();
  const router = useRouter();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Deep link: auto-expand a deal from URL ?deal=xxx
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("deal");
    }
    return null;
  });

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/deals");
      if (res.ok) {
        const data = await res.json();
        setDeals(data.directDeals || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function toggleExpand(dealId: string) {
    setExpandedId(expandedId === dealId ? null : dealId);
  }

  function handleDealSupport(deal: any) {
    // Try to open live chat with deal context, otherwise open support ticket
    const dealRef = `[Deal: ${deal.dealName} | ID: ${deal.id}]`;

    // Dispatch custom event for chat widget in layout
    const chatEvent = new CustomEvent("openDealChat", {
      detail: { dealId: deal.id, dealName: deal.dealName, message: `I have a question about my deal: ${deal.dealName}\nDeal ID: ${deal.id}` },
    });
    window.dispatchEvent(chatEvent);

    // Also navigate to support as fallback (if chat is not enabled, the ticket page handles it)
    setTimeout(() => {
      // Check if chat opened (layout sets a flag)
      if (!(window as any).__fintellaChatOpened) {
        router.push(`/dashboard/support?newTicket=true&subject=${encodeURIComponent(`Deal Support: ${deal.dealName}`)}&category=${encodeURIComponent("Deal Tracking")}&dealRef=${encodeURIComponent(dealRef)}`);
      }
      delete (window as any).__fintellaChatOpened;
    }, 200);
  }

  if (loading) {
    return (
      <div>
        <div className="animate-pulse mb-6">
          <div className="h-6 w-40 bg-[var(--app-card-bg)] rounded-lg mb-2" />
          <div className="h-3 w-64 bg-[var(--app-card-bg)] rounded-lg" />
        </div>
        <div className="card">
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
            <div className="h-4 w-24 bg-[var(--app-card-bg)] rounded animate-pulse" />
          </div>
          {[1, 2, 3].map((i) => <SkeletonTableRow key={i} cols={5} />)}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadData} disabled={!device.isMobile}>
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        My Direct Deals
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Clients you referred directly. Tap a deal to view details.
      </p>

      <div className="card">
        {deals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            No deals yet. Share your referral link to start earning commissions.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {deals.map((deal, idx) => (
              <div key={deal.id}>
                <div
                  className={`px-4 py-4 border-b border-[var(--app-border)] cursor-pointer ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}
                  onClick={() => toggleExpand(deal.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] leading-snug flex-1 min-w-0">
                      {deal.dealName}
                    </div>
                    <StageBadge stage={deal.stage} />
                  </div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-3">
                    {fmtDate(deal.createdAt)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">Refund</div>
                      <div className="font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</div>
                    </div>
                    <div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">Firm Fee</div>
                      <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{fmt$(deal.firmFeeAmount)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">Commission</div>
                      <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(deal.l1CommissionAmount)}</div>
                      <div className="mt-1"><StatusBadge status={deal.l1CommissionStatus} /></div>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === deal.id && (
                  <DealDetail deal={deal} onSupport={() => handleDealSupport(deal)} />
                )}
              </div>
            ))}
          </div>
        ) : (
          /* ── Desktop/Tablet: Grid table (horizontal scroll on narrow viewports) ── */
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
              {["Client / Deal", "Stage", "Est. Refund", "Firm Fee", "Commission", "Status"].map((h) => (
                <div key={h} className={`font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] ${h === "Status" || h === "Stage" ? "text-center" : ""}`}>{h}</div>
              ))}
            </div>
            {deals.map((deal, idx) => (
              <div key={deal.id}>
                <div
                  className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] items-center hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}
                  onClick={() => toggleExpand(deal.id)}
                >
                  <div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{deal.dealName}</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">{fmtDate(deal.createdAt)}</div>
                  </div>
                  <div className="text-center"><StageBadge stage={deal.stage} /></div>
                  <div className="font-body text-[13px] text-[var(--app-text)]">{fmt$(deal.estimatedRefundAmount)}</div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{fmt$(deal.firmFeeAmount)}</div>
                  <div className="font-display text-[15px] font-semibold text-brand-gold">{fmt$(deal.l1CommissionAmount)}</div>
                  <div className="text-center"><StatusBadge status={deal.l1CommissionStatus} /></div>
                </div>

                {/* Expanded detail */}
                {expandedId === deal.id && (
                  <DealDetail deal={deal} onSupport={() => handleDealSupport(deal)} />
                )}
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}

/* ── Deal stages for tracker ── */
const PIPELINE_STAGES = [
  "new_lead", "no_consultation", "consultation_booked", "client_no_show",
  "client_engaged", "in_process", "closedwon", "closedlost",
];

/* ── Deal Detail Component (read-only) ── */
function DealDetail({ deal, onSupport }: { deal: any; onSupport: () => void }) {
  const currentIdx = PIPELINE_STAGES.indexOf(deal.stage);
  const isClosed = deal.stage === "closedwon" || deal.stage === "closedlost";

  return (
    <div className="px-4 sm:px-6 py-5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
      {/* Deal ID */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
        <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Deal ID (Reference Number)</div>
        <div className="font-mono text-[12px] text-[var(--app-text)] mt-0.5 select-all">{deal.id}</div>
      </div>

      {/* ── Status Tracker ── */}
      <div className="mb-5">
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Deal Progress</div>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {PIPELINE_STAGES.filter((s) => s !== "closedlost" || deal.stage === "closedlost").map((stage, i) => {
            const label = STAGE_LABELS[stage]?.label || stage;
            const isActive = stage === deal.stage;
            const isPast = currentIdx >= 0 && i < currentIdx && !isClosed;
            const isWon = deal.stage === "closedwon" && stage === "closedwon";
            const isLost = deal.stage === "closedlost" && stage === "closedlost";

            return (
              <div key={stage} className="flex items-center gap-1 shrink-0">
                {i > 0 && (
                  <div className={`w-3 sm:w-5 h-0.5 ${isPast || isActive ? "bg-brand-gold" : "bg-[var(--app-border)]"}`} />
                )}
                <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[9px] sm:text-[10px] font-body font-semibold tracking-wider whitespace-nowrap ${
                  isWon ? "bg-green-500/15 text-green-400 border border-green-500/25"
                    : isLost ? "bg-red-500/15 text-red-400 border border-red-500/25"
                    : isActive ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/25"
                    : isPast ? "bg-brand-gold/10 text-brand-gold/60 border border-brand-gold/15"
                    : "bg-[var(--app-input-bg)] text-[var(--app-text-faint)] border border-[var(--app-border)]"
                }`}>
                  {(isPast || isActive || isWon) && !isLost && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Client Info */}
      <div className="mb-4">
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Client Information</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
          {[
            { label: "Client Name", value: deal.clientName || [deal.clientFirstName, deal.clientLastName].filter(Boolean).join(" ") },
            { label: "Email", value: deal.clientEmail },
            { label: "Phone", value: deal.clientPhone },
            { label: "Business Title", value: deal.clientTitle },
            { label: "Company / Entity", value: deal.legalEntityName },
            { label: "Service", value: deal.serviceOfInterest },
            { label: "City", value: deal.businessCity },
            { label: "State", value: deal.businessState },
          ].filter((f) => f.value).map((f) => (
            <div key={f.label}>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">{f.label}</div>
              <div className="font-body text-[13px] text-[var(--app-text-secondary)] mt-0.5">{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Consultation */}
      {(deal.consultBookedDate || deal.consultBookedTime) && (
        <div className="mb-4 p-3 rounded-lg flex items-center gap-4" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
          <div>
            <div className="font-body text-[10px] text-yellow-500/80 uppercase tracking-wider">Consultation Date</div>
            <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">{deal.consultBookedDate || "—"}</div>
          </div>
          <div>
            <div className="font-body text-[10px] text-yellow-500/80 uppercase tracking-wider">Consultation Time</div>
            <div className="font-body text-[13px] text-[var(--app-text)] mt-0.5">{deal.consultBookedTime || "—"}</div>
          </div>
        </div>
      )}

      {/* Tariff Info */}
      {(deal.importsGoods || deal.importCountries || deal.annualImportValue) && (
        <div className="mb-4">
          <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Tariff Information</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
            {[
              { label: "Imports Goods", value: deal.importsGoods },
              { label: "Import Countries", value: deal.importCountries },
              { label: "Annual Import Value", value: deal.annualImportValue },
              { label: "Importer of Record", value: deal.importerOfRecord },
            ].filter((f) => f.value).map((f) => (
              <div key={f.label}>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">{f.label}</div>
                <div className="font-body text-[13px] text-[var(--app-text-secondary)] mt-0.5">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Financials */}
      <div className="mb-4">
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Financial Summary</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Estimated Refund", value: fmt$(deal.estimatedRefundAmount) },
            { label: "Firm Fee", value: fmt$(deal.firmFeeAmount) },
            { label: "Your Commission", value: fmt$(deal.l1CommissionAmount), highlight: true },
            { label: "Commission Status", value: deal.l1CommissionStatus?.charAt(0).toUpperCase() + deal.l1CommissionStatus?.slice(1) || "Pending" },
          ].map((f) => (
            <div key={f.label} className="p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
              <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">{f.label}</div>
              <div className={`font-display text-base font-bold ${f.highlight ? "text-brand-gold" : "text-[var(--app-text)]"}`}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Deal Notes & Timeline */}
      <div className="mb-4">
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Deal Notes & Activity</div>
        <div className="space-y-2">
          {/* Creation event */}
          <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
            <span className="text-sm mt-0.5 shrink-0">📋</span>
            <div className="flex-1">
              <div className="font-body text-[12px] text-[var(--app-text-secondary)]">Deal created</div>
              <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-0.5">{fmtDate(deal.createdAt)}</div>
            </div>
          </div>

          {/* Consultation booked */}
          {deal.consultBookedDate && (
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)" }}>
              <span className="text-sm mt-0.5 shrink-0">📅</span>
              <div className="flex-1">
                <div className="font-body text-[12px] text-[var(--app-text-secondary)]">Consultation scheduled: {deal.consultBookedDate} {deal.consultBookedTime && `at ${deal.consultBookedTime}`}</div>
              </div>
            </div>
          )}

          {/* Affiliate notes */}
          {deal.affiliateNotes && (
            <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
              <span className="text-sm mt-0.5 shrink-0">📝</span>
              <div className="flex-1">
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Your Referral Notes</div>
                <div className="font-body text-[13px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{deal.affiliateNotes}</div>
              </div>
            </div>
          )}

          {/* Close date */}
          {deal.closeDate && (
            <div className={`flex items-start gap-3 p-3 rounded-lg ${deal.stage === "closedwon" ? "bg-green-500/5 border border-green-500/10" : "bg-red-500/5 border border-red-500/10"}`}>
              <span className="text-sm mt-0.5 shrink-0">{deal.stage === "closedwon" ? "✅" : "❌"}</span>
              <div className="flex-1">
                <div className={`font-body text-[12px] ${deal.stage === "closedwon" ? "text-green-400" : "text-red-400"}`}>
                  Deal {deal.stage === "closedwon" ? "closed won" : "closed lost"}
                </div>
                <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-0.5">{fmtDate(deal.closeDate)}</div>
                {deal.closedLostReason && (
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">{deal.closedLostReason}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deal Support Button */}
      <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--app-border)" }}>
        <div className="font-body text-[10px] text-[var(--app-text-faint)]">
          Deal ID: <span className="font-mono select-all">{deal.id}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onSupport(); }}
          className="font-body text-[12px] font-semibold text-brand-gold border border-brand-gold/20 rounded-lg px-4 py-2.5 hover:bg-brand-gold/10 transition-colors flex items-center gap-2 min-h-[44px]"
        >
          <span>🎫</span> Deal Support
        </button>
      </div>
    </div>
  );
}
