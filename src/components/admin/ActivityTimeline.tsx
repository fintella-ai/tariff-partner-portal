"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Activity Timeline — chronological list of recent portal events merged
 * client-side from existing admin endpoints. No new aggregator; this is
 * a pure read layer over /api/admin/deals + /api/admin/partners +
 * /api/admin/payouts.
 *
 * Shown as the third main section of the /admin workspace. Refreshes
 * on each workspace load (parent's 60s poll).
 */

type ActivityKind = "deal_created" | "deal_closed_won" | "deal_closed_lost" | "partner_signup" | "partner_activated" | "commission_paid";

interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;                 // ISO
  partnerCode: string | null;
  partnerName: string | null;
  label: string;              // "New deal: Acme LLC"
  href: string;               // deep link
  amount?: number | null;
}

const KIND_META: Record<ActivityKind, { icon: string; accent: string }> = {
  deal_created:      { icon: "📥", accent: "text-blue-300" },
  deal_closed_won:   { icon: "✅", accent: "text-green-400" },
  deal_closed_lost:  { icon: "❌", accent: "text-red-400" },
  partner_signup:    { icon: "🙋", accent: "text-pink-300" },
  partner_activated: { icon: "⭐", accent: "text-brand-gold" },
  commission_paid:   { icon: "💰", accent: "text-emerald-400" },
};

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function fmt$(n: number | null | undefined): string {
  if (n == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function ActivityTimeline({ refreshKey }: { refreshKey: number }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [dealsRes, partnersRes, payoutsRes] = await Promise.allSettled([
        fetch("/api/admin/deals").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/partners").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/payouts").then((r) => (r.ok ? r.json() : null)),
      ]);

      const deals = dealsRes.status === "fulfilled" ? dealsRes.value : null;
      const partners = partnersRes.status === "fulfilled" ? partnersRes.value : null;
      const payouts = payoutsRes.status === "fulfilled" ? payoutsRes.value : null;

      const merged: ActivityEvent[] = [];

      // Deals — fire one event per deal + if closed, a closed event too.
      // Uses createdAt for new, updatedAt for stage changes. Good-enough
      // heuristic without a real audit log.
      for (const d of (deals?.deals as any[]) || []) {
        merged.push({
          id: `deal_created:${d.id}`,
          kind: "deal_created",
          at: d.createdAt,
          partnerCode: d.partnerCode || null,
          partnerName: d.submittingPartnerName || d.partnerName || null,
          label: `New deal: ${d.dealName}`,
          href: `/admin/deals?deal=${d.id}`,
        });
        if (d.stage === "closedwon") {
          merged.push({
            id: `deal_closed_won:${d.id}`,
            kind: "deal_closed_won",
            at: d.closeDate || d.updatedAt,
            partnerCode: d.partnerCode || null,
            partnerName: d.submittingPartnerName || d.partnerName || null,
            label: `Closed won: ${d.dealName}`,
            href: `/admin/deals?deal=${d.id}`,
            amount: d.firmFeeAmount || null,
          });
        } else if (d.stage === "disqualified" || d.stage === "closedlost") {
          merged.push({
            id: `deal_closed_lost:${d.id}`,
            kind: "deal_closed_lost",
            at: d.updatedAt,
            partnerCode: d.partnerCode || null,
            partnerName: d.submittingPartnerName || d.partnerName || null,
            label: `Disqualified: ${d.dealName}`,
            href: `/admin/deals?deal=${d.id}`,
          });
        }
      }

      // Partners — signup + activation events (if the partner has
      // agreement.signedDate we assume activation happened then).
      for (const p of (partners?.partners as any[]) || []) {
        merged.push({
          id: `partner_signup:${p.id || p.partnerCode}`,
          kind: "partner_signup",
          at: p.createdAt,
          partnerCode: p.partnerCode || null,
          partnerName: `${p.firstName || ""} ${p.lastName || ""}`.trim() || null,
          label: `New partner: ${p.firstName || ""} ${p.lastName || ""}`.trim() || "New partner signed up",
          href: `/admin/partners/${p.id}`,
        });
        const signed = p.agreement?.signedDate || null;
        if (p.status === "active" && signed) {
          merged.push({
            id: `partner_activated:${p.id || p.partnerCode}`,
            kind: "partner_activated",
            at: signed,
            partnerCode: p.partnerCode || null,
            partnerName: `${p.firstName || ""} ${p.lastName || ""}`.trim() || null,
            label: `Partner activated: ${p.firstName || ""} ${p.lastName || ""}`.trim(),
            href: `/admin/partners/${p.id}`,
          });
        }
      }

      // Payouts — paid commissions (status=paid with payoutDate).
      for (const c of (payouts?.payouts as any[]) || []) {
        if (c.status !== "paid" || !c.payoutDate) continue;
        merged.push({
          id: `commission_paid:${c.id}`,
          kind: "commission_paid",
          at: c.payoutDate,
          partnerCode: c.partnerCode || null,
          partnerName: c.partnerName || null,
          label: `Commission paid: ${c.dealName || c.partnerCode}`,
          href: "/admin/payouts",
          amount: c.amount,
        });
      }

      // Newest first, keep top 20.
      merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      if (cancelled) return;
      setEvents(merged.slice(0, 20));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="card">
      <div className="px-4 sm:px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between">
        <div className="font-body font-semibold text-sm">Recent Activity</div>
        <div className="font-body text-[11px] theme-text-faint">last {events.length} events · newest first</div>
      </div>
      {loading ? (
        <div className="px-5 py-8 text-center font-body text-sm theme-text-muted">Loading activity…</div>
      ) : events.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="font-body text-sm theme-text-muted">No recent activity to show.</div>
        </div>
      ) : (
        <ol className="divide-y divide-[var(--app-border)]">
          {events.map((e) => {
            const meta = KIND_META[e.kind];
            return (
              <li key={e.id} className="px-4 sm:px-5 py-3 flex items-start gap-3 hover:bg-[var(--app-card-bg)] transition-colors">
                <span className="text-base mt-0.5" aria-hidden>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={e.href}
                      className={`font-body text-[13px] ${meta.accent} hover:underline truncate`}
                    >
                      {e.label}
                    </Link>
                    {e.amount != null && (
                      <span className="font-body text-[12px] theme-text-muted">{fmt$(e.amount)}</span>
                    )}
                  </div>
                  {e.partnerName && (
                    <div className="font-body text-[11px] theme-text-muted truncate">
                      {e.partnerName}
                      {e.partnerCode && <span className="font-mono theme-text-faint"> · {e.partnerCode}</span>}
                    </div>
                  )}
                </div>
                <div className="font-body text-[11px] theme-text-muted whitespace-nowrap shrink-0">
                  {relativeAge(e.at)}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
