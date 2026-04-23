"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import Link from "next/link";
import StageBadge from "@/components/ui/StageBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import LevelTag from "@/components/ui/LevelTag";
import { SkeletonTableRow, SkeletonCard } from "@/components/ui/Skeleton";
import PullToRefresh from "@/components/ui/PullToRefresh";
import DownlineTree, { type TreePartner } from "@/components/ui/DownlineTree";
import { fmt$, fmtDate } from "@/lib/format";
import { DEFAULT_L2_RATE, DEFAULT_FIRM_FEE_RATE } from "@/lib/constants";

/**
 * Status values where the L1 can upload / re-upload a signed L1↔downline
 * agreement. Kept in one place so the mobile card, desktop table, and
 * detail page stay in sync.
 *
 *   pending      — admin or the L1 has created the partner but no signed
 *                  agreement exists yet.
 *   invited      — the invite link has been issued but not yet accepted.
 *   under_review — a prior upload is waiting on admin approval; the L1
 *                  can replace it with a corrected version.
 */
const AGREEMENT_UPLOAD_STATUSES = new Set(["pending", "invited", "under_review"]);

type PartnerView = "list" | "tree";

// Opens/creates a DM thread with a downline partner, then navigates there.
// Renders nothing special — strictly additive "Message" button for eligible
// counterparties (direct child of the logged-in partner).
function MessageButton({ counterpartyCode, size = "sm" }: { counterpartyCode: string; size?: "sm" | "xs" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const sizeClass = size === "xs"
    ? "text-[10px] px-2 py-1"
    : "text-[11px] px-2.5 py-1.5";
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        try {
          const r = await fetch("/api/partner-dm/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ counterpartyCode }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            alert(d.error || `Failed to open DM (${r.status})`);
            return;
          }
          const d = await r.json();
          router.push(`/dashboard/messages/${d.thread.id}`);
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      title="Message this partner"
      className={`font-body ${sizeClass} rounded-lg border border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-40 whitespace-nowrap`}
    >
      💬 Message
    </button>
  );
}

export default function DownlinePage() {
  const device = useDevice();
  const { data: session } = useSession();
  const [partners, setPartners] = useState<any[]>([]);
  const [l3Partners, setL3Partners] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnerView, setPartnerView] = useState<PartnerView>("list");
  const [downlineTab, setDownlineTab] = useState<"partners" | "deals">("partners");

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

  // Flattened partner list for list + mobile-card views. L2 rows come
  // first (sorted by signup), then their L3 children. Tree view keeps
  // its own nested shape below.
  const displayPartners: any[] = [
    ...partners.map((p) => ({ ...p, _tier: "l2" as const })),
    ...l3Partners.map((p) => ({ ...p, _tier: "l3" as const })),
  ];

  // Build a map from partner code → partner name for display in downline deals
  const partnerNameMap: Record<string, string> = {};
  for (const p of displayPartners) {
    if (p.partnerCode) {
      partnerNameMap[p.partnerCode] = `${p.firstName} ${p.lastName}`.trim();
    }
  }

  // Inline file-upload control — used on every row whose status is in
  // AGREEMENT_UPLOAD_STATUSES. Under `under_review` the label flips to
  // "Re-upload" so the L1 can replace a rejected agreement without
  // asking an admin to reset the status.
  const uploadAgreement = async (targetPartnerCode: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await fetch("/api/partner/upload-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPartnerCode, fileName: file.name, fileData: reader.result }),
      });
      if (res.ok) { alert("Agreement uploaded! It will be reviewed by an admin."); loadData(); }
      else { const err = await res.json().catch(() => ({})); alert(err.error || "Upload failed"); }
    };
    reader.readAsDataURL(file);
  };

  const UploadLabel = ({ partnerCode, status, size }: { partnerCode: string; status: string; size: "xs" | "sm" }) => {
    const text = status === "under_review" ? "Re-upload" : status === "invited" ? "Upload Agreement" : "Upload Signed Agreement";
    const sizeCls = size === "xs"
      ? "text-[10px] px-2.5 py-1.5"
      : "text-[11px] px-3 py-2 w-full text-center block mt-2";
    return (
      <label className={`font-body ${sizeCls} text-green-400/70 border border-green-400/20 rounded-lg hover:bg-green-400/10 transition-colors cursor-pointer`}>
        {text}
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await uploadAgreement(partnerCode, file);
            e.target.value = "";
          }}
        />
      </label>
    );
  };

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

      {/* ═══ TABS ═══ */}
      <div className="card mb-6">
        <div className="flex gap-1 px-4 sm:px-6 pt-4 sm:pt-5 border-b border-[var(--app-border)]">
          {([
            { id: "partners" as const, label: "Your Partners" },
            { id: "deals" as const, label: "Downline Deals" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setDownlineTab(t.id)}
              className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
                downlineTab === t.id
                  ? "text-brand-gold border-brand-gold"
                  : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {downlineTab === "partners" && (<>
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
            {displayPartners.map((p) => {
              const initials =
                (p.firstName?.[0] || "") + (p.lastName?.[0] || "");
              return (
                <div
                  key={p.partnerCode}
                  className="px-4 py-4 border-b border-[var(--app-border-subtle)] last:border-b-0"
                >
                  <Link
                    href={`/dashboard/downline/${p.partnerCode}`}
                    className="flex items-center gap-3 mb-3 -m-1 p-1 rounded-lg hover:bg-[var(--app-card-bg)]"
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-[var(--app-card-bg)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                      <span className="font-body text-[11px] font-semibold text-[var(--app-text-secondary)] uppercase">
                        {initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                          {p.firstName} {p.lastName}
                        </div>
                        <LevelTag tier={p._tier} size="xs" />
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] truncate">
                        {p.email}
                      </div>
                    </div>
                    <StatusBadge status={p.status} />
                  </Link>
                  <div className="flex items-center justify-between font-body text-[11px] text-[var(--app-text-muted)]">
                    <span>
                      Code:{" "}
                      <span className="text-[var(--app-text-secondary)] font-mono">
                        {p.partnerCode}
                      </span>
                    </span>
                    <span>Joined {fmtDate(p.signupDate)}</span>
                  </div>
                  {p.status === "active" && (
                    <div className="mt-2 flex justify-end">
                      <MessageButton counterpartyCode={p.partnerCode} />
                    </div>
                  )}
                  {p.status === "under_review" && (
                    <div className="mt-2 text-center">
                      <span className="inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Agreement Under Review</span>
                    </div>
                  )}
                  {AGREEMENT_UPLOAD_STATUSES.has(p.status) && (
                    <UploadLabel partnerCode={p.partnerCode} status={p.status} size="sm" />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Desktop/Tablet: Table layout (horizontal scroll on narrow viewports) ── */
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
            {/* Header */}
            <div className="grid grid-cols-[2fr_0.5fr_1.4fr_1fr_0.8fr_0.8fr_1fr] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
              {["Partner", "Level", "Email", "Code", "Status", "Joined", "Agreement"].map((h) => (
                <div key={h} className={`font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] ${h === "Agreement" ? "text-right" : ""}`}>{h}</div>
              ))}
            </div>
            {/* Rows. Row is a plain div; only the Partner cell wraps in
                a Link so clicks on the file-upload control in the
                Agreement cell don't fight with link navigation. */}
            {displayPartners.map((p) => {
              const initials =
                (p.firstName?.[0] || "") + (p.lastName?.[0] || "");
              return (
                <div
                  key={p.partnerCode}
                  className="grid grid-cols-[2fr_0.5fr_1.4fr_1fr_0.8fr_0.8fr_1fr] gap-4 px-6 py-4 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors"
                >
                  {/* Col 1: Name + avatar (clickable → detail page) */}
                  <Link
                    href={`/dashboard/downline/${p.partnerCode}`}
                    className="flex items-center gap-3 min-w-0 hover:text-brand-gold"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--app-card-bg)] border border-[var(--app-border)] flex items-center justify-center shrink-0">
                      <span className="font-body text-[10px] font-semibold text-[var(--app-text-secondary)] uppercase">
                        {initials}
                      </span>
                    </div>
                    <div className="font-body text-[13px] font-medium truncate">
                      {p.firstName} {p.lastName}
                    </div>
                  </Link>
                  {/* Col 2: Level */}
                  <div><LevelTag tier={p._tier} size="xs" /></div>
                  {/* Col 3: Email */}
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)] truncate">
                    {p.email}
                  </div>
                  {/* Col 4: Code */}
                  <div className="font-mono text-[12px] text-[var(--app-text-muted)]">
                    {p.partnerCode}
                  </div>
                  {/* Col 5: Status */}
                  <div>
                    <StatusBadge status={p.status} />
                  </div>
                  {/* Col 6: Joined */}
                  <div className="font-body text-[13px] text-[var(--app-text-muted)]">
                    {fmtDate(p.signupDate)}
                  </div>
                  {/* Col 7: Agreement */}
                  <div className="text-right flex items-center justify-end gap-2">
                    {AGREEMENT_UPLOAD_STATUSES.has(p.status) ? (
                      <UploadLabel partnerCode={p.partnerCode} status={p.status} size="xs" />
                    ) : p.status === "active" ? (
                      <>
                        <span className="font-body text-[10px] text-green-400">&#10003; Active</span>
                        <MessageButton counterpartyCode={p.partnerCode} size="xs" />
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
        </>)}

        {downlineTab === "deals" && (<>
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
        </>)}
      </div>
    </div>
    </PullToRefresh>
  );
}
