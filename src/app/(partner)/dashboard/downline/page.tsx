"use client";

import { useEffect, useState } from "react";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmt$, fmtDate } from "@/lib/format";
import { DEFAULT_L2_RATE, DEFAULT_FIRM_FEE_RATE } from "@/lib/constants";
import { getDemoDownlinePartners, getDemoDownlineDeals } from "@/lib/hubspot";

export default function DownlinePage() {
  const device = useDevice();
  const [partners, setPartners] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPartners(getDemoDownlinePartners());
    setDeals(getDemoDownlineDeals());
    setLoading(false);
  }, []);

  // Build a map from partner code → partner name for display in downline deals
  const partnerNameMap: Record<string, string> = {};
  for (const partner of partners) {
    const pp = partner.properties;
    if (pp.partner_code) {
      partnerNameMap[pp.partner_code] = `${pp.firstname} ${pp.lastname}`.trim();
    }
  }

  // Resolve partner name: prefer submitting_partner_name, then map lookup, then code
  const resolvePartnerName = (p: any) =>
    p.submitting_partner_name || partnerNameMap[p.submitting_partner] || p.submitting_partner;

  // L2 commission percentage display
  const l2Pct = `${(DEFAULT_L2_RATE * 100).toFixed(0)}%`;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="spinner" />
        <div className="font-body text-sm text-white/50">
          Loading downline...
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        My Downline
      </h2>
      <p className="font-body text-sm text-white/40 mb-6">
        Partners you recruited and the deals they bring in. You earn L2
        commissions on their closed deals.
      </p>

      {/* ═══ YOUR PARTNERS ═══ */}
      <div className="card mb-6">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.06]">
          <div className="font-body font-semibold text-sm sm:text-[15px]">
            Your Partners
          </div>
        </div>

        {partners.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-white/35">
            No downline partners yet. Share your partner recruitment link to
            start building your team.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {partners.map((partner) => {
              const p = partner.properties;
              const initials =
                (p.firstname?.[0] || "") + (p.lastname?.[0] || "");
              return (
                <div
                  key={partner.id}
                  className="px-4 py-4 border-b border-white/5 last:border-b-0"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center shrink-0">
                      <span className="font-body text-[11px] font-semibold text-white/60 uppercase">
                        {initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[13px] font-medium text-white truncate">
                        {p.firstname} {p.lastname}
                      </div>
                      <div className="font-body text-[11px] text-white/30 truncate">
                        {p.email}
                      </div>
                    </div>
                    <StatusBadge status={p.partner_status} />
                  </div>
                  <div className="flex items-center justify-between font-body text-[11px] text-white/30">
                    <span>
                      Code:{" "}
                      <span className="text-white/50 font-mono">
                        {p.partner_code}
                      </span>
                    </span>
                    <span>Joined {fmtDate(p.partner_signup_date)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Desktop/Tablet: Table layout ── */
          <div>
            {/* Header */}
            <div className="grid grid-cols-[2fr_1.5fr_1fr_0.8fr_1fr] gap-4 px-6 py-3 border-b border-white/[0.06]">
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Partner
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Email
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Code
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Status
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35 text-right">
                Joined
              </div>
            </div>
            {/* Rows */}
            {partners.map((partner) => {
              const p = partner.properties;
              const initials =
                (p.firstname?.[0] || "") + (p.lastname?.[0] || "");
              return (
                <div
                  key={partner.id}
                  className="grid grid-cols-[2fr_1.5fr_1fr_0.8fr_1fr] gap-4 px-6 py-4 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Col 1: Name + avatar */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center shrink-0">
                      <span className="font-body text-[10px] font-semibold text-white/60 uppercase">
                        {initials}
                      </span>
                    </div>
                    <div className="font-body text-[13px] font-medium text-white truncate">
                      {p.firstname} {p.lastname}
                    </div>
                  </div>
                  {/* Col 2: Email */}
                  <div className="font-body text-[13px] text-white/50 truncate">
                    {p.email}
                  </div>
                  {/* Col 3: Code */}
                  <div className="font-mono text-[12px] text-white/40">
                    {p.partner_code}
                  </div>
                  {/* Col 4: Status */}
                  <div>
                    <StatusBadge status={p.partner_status} />
                  </div>
                  {/* Col 5: Joined */}
                  <div className="font-body text-[13px] text-white/40 text-right">
                    {fmtDate(p.partner_signup_date)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ DOWNLINE DEALS ═══ */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.06]">
          <div className="font-body font-semibold text-sm sm:text-[15px]">
            Downline Deals
          </div>
        </div>

        {deals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-white/35">
            No downline deals yet. Once your partners refer clients, their deals
            will appear here.
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
                    Via {resolvePartnerName(p)} · {fmtDate(p.createdate)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">
                        Est. Refund
                      </div>
                      <div className="font-body text-[13px] text-white/80">
                        {fmt$(p.estimated_refund_amount)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">
                        L2 Rate
                      </div>
                      <div className="font-body text-[13px] text-purple-400 font-semibold">
                        {l2Pct}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-body text-[9px] text-white/30 tracking-wider uppercase mb-0.5">
                        L2 Commission
                      </div>
                      <div className="font-display text-sm font-semibold text-brand-gold">
                        {fmt$(p.l2_commission_amount)}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={p.l2_commission_status} />
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
            {/* Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_0.6fr_1fr_0.7fr] gap-4 px-6 py-3 border-b border-white/[0.06]">
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Client / Deal
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Stage
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                Est. Refund
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35 text-center">
                L2 %
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35">
                L2 Commission
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-white/35 text-right">
                Status
              </div>
            </div>
            {/* Rows */}
            {deals.map((deal) => {
              const p = deal.properties;
              return (
                <div
                  key={deal.id}
                  className="grid grid-cols-[2fr_1fr_1fr_0.6fr_1fr_0.7fr] gap-4 px-6 py-4 border-b border-white/[0.04] last:border-b-0 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Col 1: Deal name + partner name */}
                  <div>
                    <div className="font-body text-[13px] font-medium text-white truncate">
                      {p.dealname}
                    </div>
                    <div className="font-body text-[11px] text-white/30 mt-0.5 truncate">
                      Via {resolvePartnerName(p)} · {fmtDate(p.createdate)}
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
                  {/* Col 4: L2 % */}
                  <div className="text-center">
                    <span className="font-body text-[12px] text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
                      {l2Pct}
                    </span>
                  </div>
                  {/* Col 5: L2 Commission */}
                  <div className="font-display text-[15px] font-semibold text-brand-gold">
                    {fmt$(p.l2_commission_amount)}
                  </div>
                  {/* Col 6: Status */}
                  <div className="text-right">
                    <StatusBadge status={p.l2_commission_status} />
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
