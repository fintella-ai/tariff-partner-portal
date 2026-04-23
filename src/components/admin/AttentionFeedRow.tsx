"use client";

import Link from "next/link";

export type AttentionSource =
  | "email"
  | "sms"
  | "chat"
  | "ticket"
  | "agreement"
  | "partner"
  | "payout"
  | "feature";

export interface AttentionItem {
  id: string;
  source: AttentionSource;
  partnerCode: string | null;
  partnerName: string | null;
  summary: string;
  createdAt: string;
  href: string;
  actionLabel: string;
}

const SOURCE_META: Record<AttentionSource, { icon: string; label: string; accent: string }> = {
  email:     { icon: "📧", label: "Email",       accent: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
  sms:       { icon: "💬", label: "SMS",         accent: "bg-green-500/10 text-green-300 border-green-500/20" },
  chat:      { icon: "💭", label: "Live Chat",   accent: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
  ticket:    { icon: "🎫", label: "Ticket",      accent: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20" },
  agreement: { icon: "📝", label: "Agreement",   accent: "bg-orange-500/10 text-orange-300 border-orange-500/20" },
  partner:   { icon: "🙋", label: "New Partner", accent: "bg-pink-500/10 text-pink-300 border-pink-500/20" },
  payout:    { icon: "💰", label: "Payout",      accent: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  feature:   { icon: "💡", label: "Request",     accent: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" },
};

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/**
 * Single row in the admin workspace "Needs Attention" feed. Renders a
 * source badge, partner label, summary, relative age, and a quick-action
 * button that deep-links to the page where the action lives.
 */
export default function AttentionFeedRow({ item }: { item: AttentionItem }) {
  const meta = SOURCE_META[item.source];
  const age = relativeAge(item.createdAt);
  const staleBadge =
    (Date.now() - new Date(item.createdAt).getTime()) / 86_400_000 >= 3
      ? "text-red-400"
      : "theme-text-muted";

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-4 sm:px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors">
      <div className="text-lg" aria-hidden>{meta.icon}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase border ${meta.accent}`}>
            {meta.label}
          </span>
          {item.partnerName && (
            <span className="font-body text-[12px] text-[var(--app-text)] truncate">
              {item.partnerName}
            </span>
          )}
          {item.partnerCode && (
            <span className="font-mono text-[10px] theme-text-faint">{item.partnerCode}</span>
          )}
        </div>
        <div className="font-body text-[13px] text-[var(--app-text-secondary)] truncate">
          {item.summary}
        </div>
      </div>
      <div className={`font-body text-[11px] ${staleBadge} whitespace-nowrap`}>{age}</div>
      <Link
        href={item.href}
        className="font-body text-[11px] text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors whitespace-nowrap"
      >
        {item.actionLabel} ↗
      </Link>
    </div>
  );
}
