"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import { SkeletonTableRow, SkeletonCard } from "@/components/ui/Skeleton";
import PullToRefresh from "@/components/ui/PullToRefresh";
import DownlineTree, { type TreePartner } from "@/components/ui/DownlineTree";
import { fmt$, fmtDate } from "@/lib/format";
import { DEFAULT_L2_RATE, DEFAULT_FIRM_FEE_RATE } from "@/lib/constants";

type PartnerView = "list" | "tree";

export default function DownlinePage() {
  const device = useDevice();
  const { data: session } = useSession();
  const [partners, setPartners] = useState<any[]>([]);
  const [l3Partners, setL3Partners] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnerView, setPartnerView] = useState<PartnerView>("list");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/deals");
      if (res.ok) {
        const data = await res.json();
        setPartners(data.downlinePartners || []);
        setL3Partners(data.l3Partners || []);
        setDeals(data.downlineDeals || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Build a map from partner code → partner name for display in downline deals
  const partnerNameMap: Record<string, string> = {};
  for (const p of partners) {
    if (p.partnerCode) {
      partnerNameMap[p.partnerCode] = `${p.firstName} ${p.lastName}`.trim();
    }
  }

  // Resolve partner name: prefer submittingPartnerName, then map lookup, then code
  const resolvePartnerName = (p: any) =>
    p.submittingPartnerName || partnerNameMap[p.partnerCode] || p.partnerCode;

  // L2 commission percentage display
  const l2Pct = `${(DEFAULT_L2_RATE * 100).toFixed(0)}%`;

  if (loading) {
    return (
      <div>
        <div className="animate-pulse mb-6">
          <div className="h-6 w-36 bg-[var(--app-card-bg)] rounded-lg mb-2" />
          <div className="h-3 w-64 bg-[var(--app-card-bg)] rounded-lg" />
        </div>
        <div className="card mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
            <div className="h-4 w-28 bg-[var(--app-card-bg)] rounded animate-pulse" />
          </div>
          {[1, 2, 3].map((i) => <SkeletonTableRow key={i} cols={5} />)}
        </div>
        <div className="card">
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
            <div className="h-4 w-28 bg-[var(--app-card-bg)] rounded animate-pulse" />
          </div>
          {[1, 2].map((i) => <SkeletonTableRow key={i} cols={6} />)}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadData} disabled={!device.isMobile}>
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        My Downline
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Partners you recruited and the deals they bring in. You earn L2
        commissions on their closed deals.
      </p>

      {/* ═══ YOUR PARTNERS ═══ */}
      <div className="card mb-6">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--app-border)] flex items-center justify-between flex-wrap gap-2">
          <div className="font-body font-semibold text-sm sm:text-[15px]">
            Your Partners
          </div>
          {partners.length > 0 && (
            <div className="flex bg-[var(--app-input-bg)] rounded-lg p-0.5">
              <button
                onClick={() => setPartnerView("list")}
                className={`font-body text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  partnerView === "list" ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                List
              </button>
              <button
                onClick={() => setPartnerView("tree")}
                className={`font-body text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  partnerView === "tree" ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 0a4 4 0 014 4h2a2 2 0 012 2v2M12 8a4 4 0 00-4 4H6a2 2 0 00-2 2v2m8-8v4m0 0a2 2 0 012 2v2m-2-4a2 2 0 00-2 2v2" />
                </svg>
                Tree View
              </button>
            </div>
          )}
        </div>

        {partners.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            No downline partners yet. Share your partner recruitment link to
            start building your team.
          </div>
        ) : partnerView === "tree" ? (
          /* ── Tree View ── */
          (() => {
            const user = session?.user as any;
            const rootPartner: TreePartner = {
              id: "self",
              partnerCode: user?.partnerCode || "YOU",
              firstName: user?.name?.split(" ")[0] || "You",
              lastName: user?.name?.split(" ").slice(1).join(" ") || "",
              status: "active",
              children: partners.map((p) => ({
                id: p.id,
                partnerCode: p.partnerCode,
                firstName: p.firstName,
                lastName: p.lastName,
                status: p.status,
                commissionRate: p.commissionRate,
                children: l3Partners
                  .filter((l3) => l3.referredByPartnerCode === p.partnerCode)
                  .map((l3) => ({
                    id: l3.id,
                    partnerCode: l3.partnerCode,
                    firstName: l3.firstName,
                    lastName: l3.lastName,
                    status: l3.status,
                    commissionRate: (l3 as any).commissionRate,
                    children: [],
                  })),
              })),
            };
            return <DownlineTree root={rootPartner} isMobile={device.isMobile} />;
          })()
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {partners.map((p) => {
              const initials =
                (p.firstName?.[0] || "") + (p.lastName?.[0] || "");
              return (
                <div
                  key={p.partnerCode}
                  className="px-4 py-4 border-b border-[var(--app-border-subtle)] last:border-b-0"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-[var(--app-card-bg)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                      <span className="font-body text-[11px] font-semibold text-[var(--app-text-secondary)] uppercase">
                        {initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">
                        {p.email}
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center justify-between font-body text-[11px] text-[var(--app-text-muted)]">
                    <span>
                      Code:{" "}
                      <span className="text-[var(--app-text-secondary)] font-mono">
                        {p.partnerCode}
                      </span>
                    </span>
                    <span>Joined {fmtDate(p.signupDate)}</span>
                  </div>
                  {p.status === "pending" && (
                    <label className="mt-2 w-full font-body text-[11px] text-green-400/70 border border-green-400/20 rounded-lg px-3 py-2 hover:bg-green-400/10 transition-colors cursor-pointer text-center block">
                      Upload Signed Agreement
                      <input type="file" accept=".pdf,.doc,.docx,.png,.jpg" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const res = await fetch("/api/partner/upload-agreement", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ targetPartnerCode: p.partnerCode, fileName: file.name, fileData: reader.result }),
                          });
                          if (res.ok) { alert("Agreement uploaded! It will be reviewed by an admin."); loadData(); }
                          else { const err = await res.json().catch(() => ({})); alert(err.error || "Upload failed"); }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }} />
                    </label>
                  )}
                  {p.status === "under_review" && (
                    <div className="mt-2 text-center">
                      <span className="inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Agreement Under Review</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Desktop/Tablet: Table layout (horizontal scroll on narrow viewports) ── */
          <div className="overflow-x-auto">
            <div className="min-w-[840px]">
            {/* Header */}
            <div className="grid grid-cols-[2fr_1.5fr_1fr_0.7fr_0.8fr_0.8fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
              {["Partner", "Email", "Code", "Status", "Joined", "Agreement"].map((h) => (
                <div key={h} className={`font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] ${h === "Agreement" ? "text-right" : ""}`}>{h}</div>
              ))}
            </div>
            {/* Rows */}
            {partners.map((p) => {
              const initials =
                (p.firstName?.[0] || "") + (p.lastName?.[0] || "");
              return (
                <div
                  key={p.partnerCode}
                  className="grid grid-cols-[2fr_1.5fr_1fr_0.7fr_0.8fr_0.8fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors"
                >
                  {/* Col 1: Name + avatar */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--app-card-bg)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                      <span className="font-body text-[10px] font-semibold text-[var(--app-text-secondary)] uppercase">
                        {initials}
                      </span>
                    </div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                      {p.firstName} {p.lastName}
                    </div>
                  </div>
                  {/* Col 2: Email */}
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)] truncate">
                    {p.email}
                  </div>
                  {/* Col 3: Code */}
                  <div className="font-mono text-[12px] text-[var(--app-text-muted)]">
                    {p.partnerCode}
                  </div>
                  {/* Col 4: Status */}
                  <div>
                    <StatusBadge status={p.status} />
                  </div>
                  {/* Col 5: Joined */}
                  <div className="font-body text-[13px] text-[var(--app-text-muted)]">
                    {fmtDate(p.signupDate)}
                  </div>
                  {/* Col 6: Agreement */}
                  <div className="text-right flex items-center justify-end gap-2">
                    {p.status === "pending" ? (
                      <label className="font-body text-[10px] text-green-400/70 border border-green-400/20 rounded-lg px-2.5 py-1.5 hover:bg-green-400/10 transition-colors cursor-pointer">
                        Upload Agreement
                        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async () => {
                            const res = await fetch("/api/partner/upload-agreement", {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ targetPartnerCode: p.partnerCode, fileName: file.name, fileData: reader.result }),
                            });
                            if (res.ok) { alert("Agreement uploaded! It will be reviewed by an admin."); loadData(); }
                            else { const err = await res.json().catch(() => ({})); alert(err.error || "Upload failed"); }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }} />
                      </label>
                    ) : p.status === "under_review" ? (
                      <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Under Review</span>
                    ) : (
                      <span className="font-body text-[10px] text-green-400">&#10003; Active</span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* ═══ DOWNLINE DEALS ═══ */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--app-border)]">
          <div className="font-body font-semibold text-sm sm:text-[15px]">
            Downline Deals
          </div>
        </div>

        {deals.length === 0 ? (
          <div className="p-12 text-center font-body text-sm text-[var(--app-text-muted)]">
            No downline deals yet. Once your partners refer clients, their deals
            will appear here.
          </div>
        ) : device.isMobile ? (
          /* ── Mobile: Card layout ── */
          <div>
            {deals.map((p) => (
                <div
                  key={p.dealName}
                  className="px-4 py-4 border-b border-[var(--app-border-subtle)] last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] leading-snug flex-1 min-w-0">
                      {p.dealName}
                    </div>
                    <StageBadge stage={p.stage} />
                  </div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-3">
                    Via {resolvePartnerName(p)} · {fmtDate(p.createdAt)}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">
                        Est. Refund
                      </div>
                      <div className="font-body text-[13px] text-[var(--app-text)]">
                        {fmt$(p.estimatedRefundAmount)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">
                        L2 Rate
                      </div>
                      <div className="font-body text-[13px] text-purple-400 font-semibold">
                        {l2Pct}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-body text-[9px] text-[var(--app-text-muted)] tracking-wider uppercase mb-0.5">
                        L2 Commission
                      </div>
                      <div className="font-display text-sm font-semibold text-brand-gold">
                        {fmt$(p.l2CommissionAmount)}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={p.l2CommissionStatus} />
                      </div>
                    </div>
                  </div>
                </div>
            ))}
          </div>
        ) : (
          /* ── Desktop/Tablet: Grid table ── */
          <div>
            {/* Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_0.6fr_1fr_0.7fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Client / Deal
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Stage
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                Est. Refund
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-center">
                L2 %
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                L2 Commission
              </div>
              <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">
                Status
              </div>
            </div>
            {/* Rows */}
            {deals.map((p) => (
                <div
                  key={p.dealName}
                  className="grid grid-cols-[2fr_1fr_1fr_0.6fr_1fr_0.7fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors"
                >
                  {/* Col 1: Deal name + partner name */}
                  <div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                      {p.dealName}
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                      Via {resolvePartnerName(p)} · {fmtDate(p.createdAt)}
                    </div>
                  </div>
                  {/* Col 2: Stage */}
                  <div>
                    <StageBadge stage={p.stage} />
                  </div>
                  {/* Col 3: Est. Refund */}
                  <div className="font-body text-[13px] text-[var(--app-text)]">
                    {fmt$(p.estimatedRefundAmount)}
                  </div>
                  {/* Col 4: L2 % */}
                  <div className="text-center">
                    <span className="font-body text-[12px] text-purple-400 font-semibold bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
                      {l2Pct}
                    </span>
                  </div>
                  {/* Col 5: L2 Commission */}
                  <div className="font-display text-[15px] font-semibold text-brand-gold">
                    {fmt$(p.l2CommissionAmount)}
                  </div>
                  {/* Col 6: Status */}
                  <div className="text-right">
                    <StatusBadge status={p.l2CommissionStatus} />
                  </div>
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
