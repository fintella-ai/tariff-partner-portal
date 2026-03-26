"use client";

import { useEffect, useState } from "react";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmt$, fmtDate } from "@/lib/format";
import { getDemoDirectDeals } from "@/lib/hubspot";

export default function DealsPage() {
  const device = useDevice();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDeals(getDemoDirectDeals());
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="spinner" />
        <div className="font-body text-sm text-white/50">Loading deals...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        My Direct Deals
      </h2>
      <p className="font-body text-sm text-white/40 mb-6">
        Clients you referred directly. You earn a commission on each Closed Won
        deal.
      </p>

      <div className="card">
        {deals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-white/35">
            No deals yet. Share your referral link to start earning commissions.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {deals.map((deal) => {
              const p = deal.properties;
              return (
                <div
                  key={deal.id}
                  className="px-4 py-4 border-b border-white/5 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-body text-[13px] font-medium text-white leading-snug flex-1 min-w-0">
                      {p.dealname}
                    </div>
                    <StageBadge stage={p.dealstage} />
                  </div>
                  <div className="font-body text-[11px] text-white/30 mb-3">
                    {p.ieepa_imported_products || p.product_type} ·{" "}
                    {fmtDate(p.createdate)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">
                        Refund
                      </div>
                      <div className="font-body text-[13px] text-white/80">
                        {fmt$(p.estimated_refund_amount)}
                      </div>
                    </div>
                    <div>
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">
                        Firm Fee
                      </div>
                      <div className="font-body text-[13px] text-white/60">
                        {fmt$(p.firm_fee_amount)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">
                        Commission
                      </div>
                      <div className="font-display text-sm font-semibold text-brand-gold">
                        {fmt$(p.l1_commission_amount)}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={p.l1_commission_status} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Desktop/Tablet: Grid table ── */
          <div>
            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr] gap-4 px-6 py-3 border-b border-white/[0.06]">
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Client / Deal
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Stage
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Est. Refund
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Firm Fee
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Commission
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35 text-right">
                Status
              </div>
            </div>
            {/* Data rows */}
            {deals.map((deal) => {
              const p = deal.properties;
              return (
                <div
                  key={deal.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_0.7fr] gap-4 px-6 py-4 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Col 1: Deal name */}
                  <div>
                    <div className="font-body text-[13px] font-medium text-white truncate">
                      {p.dealname}
                    </div>
                    <div className="font-body text-[11px] text-white/30 mt-0.5 truncate">
                      {p.ieepa_imported_products || p.product_type} ·{" "}
                      {fmtDate(p.createdate)}
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
                  {/* Col 5: Commission */}
                  <div className="font-display text-[15px] font-semibold text-brand-gold">
                    {fmt$(p.l1_commission_amount)}
                  </div>
                  {/* Col 6: Status */}
                  <div className="text-right">
                    <StatusBadge status={p.l1_commission_status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
