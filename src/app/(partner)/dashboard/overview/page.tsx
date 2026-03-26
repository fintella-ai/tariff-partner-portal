"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmt$, fmtDate } from "@/lib/format";
import { useDevice } from "@/lib/useDevice";
import {
  getDemoDirectDeals,
  getDemoDownlinePartners,
  getDemoDownlineDeals,
} from "@/lib/hubspot";

export default function OverviewPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const [directDeals, setDirectDeals] = useState<any[]>([]);
  const [downlinePartners, setDownlinePartners] = useState<any[]>([]);
  const [downlineDeals, setDownlineDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDirectDeals(getDemoDirectDeals());
    setDownlinePartners(getDemoDownlinePartners());
    setDownlineDeals(getDemoDownlineDeals());
    setLoading(false);
  }, []);

  const totalRefundPipeline = directDeals.reduce(
    (s, d) => s + Number(d.properties.estimated_refund_amount || 0), 0
  );
  const totalL1Earned = directDeals.reduce(
    (s, d) => s + Number(d.properties.l1_commission_amount || 0), 0
  );
  const totalL1Paid = directDeals
    .filter((d) => d.properties.l1_commission_status === "paid")
    .reduce((s, d) => s + Number(d.properties.l1_commission_amount || 0), 0);
  const totalL2Earned = downlineDeals.reduce(
    (s, d) => s + Number(d.properties.l2_commission_amount || 0), 0
  );
  const totalL2Paid = downlineDeals
    .filter((d) => d.properties.l2_commission_status === "paid")
    .reduce((s, d) => s + Number(d.properties.l2_commission_amount || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="spinner" />
        <div className="font-body text-sm text-white/50">Loading your dashboard...</div>
      </div>
    );
  }

  const stats = [
    { label: "Refund Pipeline", value: fmt$(totalRefundPipeline), sub: "All deals" },
    { label: "L1 Earned", value: fmt$(totalL1Earned), sub: `${fmt$(totalL1Paid)} paid` },
    { label: "L2 Earned", value: fmt$(totalL2Earned), sub: `${fmt$(totalL2Paid)} paid` },
    { label: "Team Size", value: String(downlinePartners.length), sub: "Partners" },
  ];

  return (
    <div>
      {/* Stat Cards */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 ${device.gap} mb-5 sm:mb-8`}>
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="font-body text-[9px] tracking-[1.5px] uppercase text-white/40 mb-2">
              {s.label}
            </div>
            <div className="font-display text-[22px] sm:text-[28px] font-bold text-brand-gold mb-0.5">
              {s.value}
            </div>
            <div className="font-body text-[11px] text-white/35">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ RECENT DIRECT DEALS ═══ */}
      <div className="card mb-6">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.06]">
          <div className="font-body font-semibold text-sm sm:text-[15px]">Recent Direct Deals</div>
        </div>

        {directDeals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-white/35">
            No direct deals yet. Share your referral link to get started.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {directDeals.slice(0, 5).map((deal) => {
              const p = deal.properties;
              return (
                <div key={deal.id} className="px-4 py-4 border-b border-white/5 last:border-b-0">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-body text-[13px] font-medium text-white leading-snug flex-1 min-w-0">
                      {p.dealname}
                    </div>
                    <StageBadge stage={p.dealstage} />
                  </div>
                  <div className="font-body text-[11px] text-white/30 mb-3">
                    {p.ieepa_imported_products || p.product_type} · {fmtDate(p.createdate)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">Refund</div>
                      <div className="font-body text-[13px] text-white/80">{fmt$(p.estimated_refund_amount)}</div>
                    </div>
                    <div>
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">Firm Fee</div>
                      <div className="font-body text-[13px] text-white/60">{fmt$(p.firm_fee_amount)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">Commission</div>
                      <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(p.l1_commission_amount)}</div>
                      <div className="mt-1"><StatusBadge status={p.l1_commission_status} /></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Desktop/Tablet: Grid table with aligned columns ── */
          <div>
            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-white/[0.06]">
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">Client / Deal</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">Stage</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">Est. Refund</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">Firm Fee</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35 text-right">Commission</div>
            </div>
            {/* Data rows */}
            {directDeals.slice(0, 5).map((deal) => {
              const p = deal.properties;
              return (
                <div
                  key={deal.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-6 py-4 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Col 1: Deal name */}
                  <div>
                    <div className="font-body text-[13px] font-medium text-white truncate">{p.dealname}</div>
                    <div className="font-body text-[11px] text-white/30 mt-0.5 truncate">
                      {p.ieepa_imported_products || p.product_type} · {fmtDate(p.createdate)}
                    </div>
                  </div>
                  {/* Col 2: Stage */}
                  <div>
                    <StageBadge stage={p.dealstage} />
                  </div>
                  {/* Col 3: Est. Refund */}
                  <div className="font-body text-[13px] text-white/80">
                    {fmt$(p.estimated_refund_amount)}
                  </div>
                  {/* Col 4: Firm Fee */}
                  <div className="font-body text-[13px] text-white/60">
                    {fmt$(p.firm_fee_amount)}
                  </div>
                  {/* Col 5: Commission + Status */}
                  <div className="text-right">
                    <div className="font-display text-[15px] font-semibold text-brand-gold mb-1">
                      {fmt$(p.l1_commission_amount)}
                    </div>
                    <StatusBadge status={p.l1_commission_status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ RECENT DOWNLINE ACTIVITY ═══ */}
      {downlineDeals.length > 0 && (
        <div className="card">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.06]">
            <div className="font-body font-semibold text-sm sm:text-[15px]">
              Recent Downline Activity
            </div>
          </div>

          {device.isMobile ? (
            /* ── Mobile: Card layout ── */
            <div>
              {downlineDeals.slice(0, 3).map((deal) => {
                const p = deal.properties;
                return (
                  <div key={deal.id} className="px-4 py-4 border-b border-white/5 last:border-b-0">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="font-body text-[13px] font-medium text-white leading-snug flex-1 min-w-0">
                        {p.dealname}
                      </div>
                      <StageBadge stage={p.dealstage} />
                    </div>
                    <div className="font-body text-[11px] text-white/30 mb-3">
                      Via {p.submitting_partner} · {fmtDate(p.createdate)}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">Refund</div>
                        <div className="font-body text-[13px] text-white/80">{fmt$(p.estimated_refund_amount)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">L2 Commission</div>
                        <div className="font-display text-sm font-semibold text-brand-gold">{fmt$(p.l2_commission_amount)}</div>
                        <div className="mt-1"><StatusBadge status={p.l2_commission_status} /></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Desktop/Tablet: Grid table ── */
            <div>
              {/* Header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-white/[0.06]">
                <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">Client / Deal</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">Stage</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">Est. Refund</div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35 text-right">L2 Commission</div>
              </div>
              {/* Rows */}
              {downlineDeals.slice(0, 3).map((deal) => {
                const p = deal.properties;
                return (
                  <div
                    key={deal.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-4 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.02] transition-colors"
                  >
                    <div>
                      <div className="font-body text-[13px] font-medium text-white truncate">{p.dealname}</div>
                      <div className="font-body text-[11px] text-white/30 mt-0.5 truncate">
                        Via {p.submitting_partner} · {fmtDate(p.createdate)}
                      </div>
                    </div>
                    <div>
                      <StageBadge stage={p.dealstage} />
                    </div>
                    <div className="font-body text-[13px] text-white/80">
                      {fmt$(p.estimated_refund_amount)}
                    </div>
                    <div className="text-right">
                      <div className="font-display text-[15px] font-semibold text-brand-gold mb-1">
                        {fmt$(p.l2_commission_amount)}
                      </div>
                      <StatusBadge status={p.l2_commission_status} />
                    </div>
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
