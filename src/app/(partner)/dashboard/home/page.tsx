"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";
import { fmt$ } from "@/lib/format";

/* ═══════════════════════════════════════════════════════════════════════════
   DEMO DATA
   ═══════════════════════════════════════════════════════════════════════════ */

const ANNOUNCEMENTS = [
  {
    id: "1",
    title: "New Commission Tier Available",
    body: "We've introduced a Level 3 commission structure for partners with 5+ active sub-partners. Contact your partner manager for details.",
    date: "Mar 22, 2026",
    badge: "New" as const,
  },
  {
    id: "2",
    title: "Q1 2026 Payout Schedule",
    body: "All Q1 commissions will be processed by April 15th. Ensure your W-9 is current in the Documents tab.",
    date: "Mar 15, 2026",
    badge: "Important" as const,
  },
  {
    id: "3",
    title: "Platform Update: Real-Time Deal Tracking",
    body: "You can now see deal stage changes in real-time on your Overview dashboard. No more waiting for email updates!",
    date: "Mar 10, 2026",
    badge: "Update" as const,
  },
];

const BADGE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  New:       { bg: "bg-green-500/10",  border: "border-green-500/20",  text: "text-green-400" },
  Important: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400" },
  Update:    { bg: "bg-blue-500/10",   border: "border-blue-500/20",   text: "text-blue-400" },
};

const LEADERBOARD = [
  { rank: 1,  name: "Partner #847", deals: 12, revenue: 156000 },
  { rank: 2,  name: "Partner #312", deals: 9,  revenue: 118500 },
  { rank: 3,  name: "Partner #695", deals: 8,  revenue: 97200 },
  { rank: 4,  name: "Partner #158", deals: 7,  revenue: 84300 },
  { rank: 5,  name: "Partner #423", deals: 6,  revenue: 72100 },
  { rank: 6,  name: "Partner #561", deals: 5,  revenue: 63400 },
  { rank: 7,  name: "Partner #209", deals: 5,  revenue: 58700 },
  { rank: 8,  name: "Partner #734", deals: 4,  revenue: 47500 },
  { rank: 9,  name: "Partner #382", deals: 3,  revenue: 36200 },
  { rank: 10, name: "Partner #916", deals: 2,  revenue: 24800 },
];

const UPCOMING_EVENTS = [
  {
    icon: "\u{1F4DE}",
    title: "Weekly Partner Training Call",
    body: "Join us every Wednesday at 2pm EST for tips on maximizing referrals.",
    date: "Mar 26, 2026",
    cta: "Join Call",
  },
  {
    icon: "\u{1F3A5}",
    title: "Q2 Kickoff Webinar",
    body: "Learn about new product lines and updated commission structures for Q2.",
    date: "Apr 1, 2026",
    cta: "Register",
  },
  {
    icon: "\u{1F389}",
    title: "Partner Appreciation Happy Hour",
    body: "Virtual networking event for our top partners. Prizes and giveaways!",
    date: "Apr 10, 2026",
    cta: "RSVP",
  },
];

const REFERRAL_OPPS = [
  {
    title: "Recruit Sub-Partners",
    body: "Earn L2 commissions on every deal your sub-partners close. Share your recruitment link today.",
    cta: "Get Recruitment Link",
    primary: true,
  },
  {
    title: "Cross-Referral Program",
    body: "Know businesses that need trade compliance consulting? Earn a flat $500 referral bonus per engagement.",
    cta: "Learn More",
    primary: false,
  },
  {
    title: "Volume Bonus",
    body: "Close 10+ deals in a quarter and earn a 2% bonus on all commissions.",
    cta: "View Progress",
    primary: false,
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function rankBg(rank: number) {
  if (rank === 1) return "bg-yellow-500/[0.08] border-yellow-500/20";
  if (rank === 2) return "bg-gray-400/[0.06] border-gray-400/15";
  if (rank === 3) return "bg-orange-500/[0.06] border-orange-500/15";
  return "";
}

function rankBadgeCls(rank: number) {
  if (rank === 1) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (rank === 2) return "bg-gray-400/15 text-gray-300 border-gray-400/20";
  if (rank === 3) return "bg-orange-500/15 text-orange-400 border-orange-500/20";
  return "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border-[var(--app-border)]";
}

function formatDateHeading() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePage() {
  const { data: session } = useSession();
  const device = useDevice();
  const user = session?.user as any;
  const firstName = user?.name?.split(" ")[0] || "Partner";
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.settings?.leaderboardEnabled !== undefined) {
          setLeaderboardEnabled(d.settings.leaderboardEnabled);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* ══════════════════ WELCOME HEADER ══════════════════ */}
      <div className={`mb-6 sm:mb-8 animate-fade-up ${device.isMobile ? "text-center" : ""}`}>
        <h1 className={`font-display ${device.headingSize} font-bold text-[var(--app-text)] mb-1`}>
          Welcome Back, {firstName}
        </h1>
        <p className="font-body text-[13px] text-[var(--app-text-muted)]">{formatDateHeading()}</p>
      </div>

      {/* ══════════════════ SECTION 1: ANNOUNCEMENTS ══════════════════ */}
      <div className="mb-6 sm:mb-8 animate-fade-up">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-4">
          Announcements
        </h2>
        <div className="flex flex-col gap-3">
          {ANNOUNCEMENTS.map((a) => {
            const badge = BADGE_STYLES[a.badge];
            return (
              <div
                key={a.id}
                className="card border-l-2 border-l-brand-gold overflow-hidden"
              >
                <div className="px-4 sm:px-6 py-4 sm:py-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="font-body text-sm font-semibold text-[var(--app-text)] leading-snug">
                      {a.title}
                    </div>
                    <span
                      className={`${badge.bg} ${badge.border} ${badge.text} border rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase shrink-0`}
                    >
                      {a.badge}
                    </span>
                  </div>
                  <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-2">
                    {a.body}
                  </p>
                  <div className="font-body text-[11px] text-[var(--app-text-faint)]">{a.date}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════ SECTION 2: LEADERBOARD ══════════════════ */}
      {leaderboardEnabled && <div className="mb-6 sm:mb-8 animate-fade-up">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-1">
          Partner Leaderboard &mdash; March 2026
        </h2>
        <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-4">
          Top performers this month (names hidden for privacy)
        </p>

        <div className="card overflow-hidden">
          {device.isMobile ? (
            /* ── Mobile: card layout ── */
            <div>
              {LEADERBOARD.map((p) => (
                <div
                  key={p.rank}
                  className={`px-4 py-4 border-b border-[var(--app-border)] last:border-b-0 ${rankBg(p.rank)} ${p.rank <= 3 ? "border" : ""}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-display text-xs font-bold border shrink-0 ${rankBadgeCls(p.rank)}`}
                    >
                      {p.rank}
                    </div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)]">
                      {p.name}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pl-11">
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                      {p.deals} deals closed
                    </div>
                    <div className="font-display text-sm font-semibold text-brand-gold">
                      {fmt$(p.revenue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Desktop: table layout ── */
            <div>
              {/* Header */}
              <div className="grid grid-cols-[50px_1fr_120px_140px] gap-4 px-6 py-3 border-b border-[var(--app-border)]">
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                  Rank
                </div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)]">
                  Partner
                </div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-center">
                  Deals Closed
                </div>
                <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] text-right">
                  Total Revenue
                </div>
              </div>
              {/* Rows */}
              {LEADERBOARD.map((p) => (
                <div
                  key={p.rank}
                  className={`grid grid-cols-[50px_1fr_120px_140px] gap-4 px-6 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors ${rankBg(p.rank)}`}
                >
                  <div>
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-display text-xs font-bold border shrink-0 ${rankBadgeCls(p.rank)}`}
                    >
                      {p.rank}
                    </div>
                  </div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{p.name}</div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)] text-center">
                    {p.deals}
                  </div>
                  <div className="font-display text-[14px] font-semibold text-brand-gold text-right">
                    {fmt$(p.revenue)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Your Rank callout */}
          <div className="px-4 sm:px-6 py-4 border-t border-[var(--app-border)] bg-brand-gold/[0.04]">
            <div className="flex items-center gap-2">
              <span className="font-body text-[13px] text-[var(--app-text-secondary)]">Your Rank:</span>
              <span className="font-display text-lg font-bold text-brand-gold">#4</span>
              <span className="font-body text-[11px] text-[var(--app-text-muted)] ml-1">
                &mdash; Keep it up!
              </span>
            </div>
          </div>
        </div>
      </div>}

      {/* ══════════════════ SECTION 3: UPCOMING EVENTS ══════════════════ */}
      <div className="mb-6 sm:mb-8 animate-fade-up">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-4">
          Upcoming Events
        </h2>
        <div
          className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"} ${device.gap}`}
        >
          {UPCOMING_EVENTS.map((e, i) => (
            <div key={i} className={`card ${device.cardPadding} flex flex-col`}>
              <div className="text-3xl mb-3">{e.icon}</div>
              <div className="font-body text-sm font-semibold text-[var(--app-text)] mb-1.5">
                {e.title}
              </div>
              <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-3 flex-1">
                {e.body}
              </p>
              <div className="font-body text-[11px] text-[var(--app-text-faint)] mb-4">{e.date}</div>
              <button className="w-full font-body text-[11px] tracking-[1px] uppercase text-brand-gold border border-brand-gold/30 rounded-lg px-4 py-2.5 hover:bg-brand-gold/10 transition-colors">
                {e.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════ SECTION 4: REFERRAL OPPORTUNITIES ══════════════════ */}
      <div className="animate-fade-up">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-1">
          Expand Your Earnings
        </h2>
        <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-4">
          Additional referral opportunities to grow your income with {FIRM_SHORT}
        </p>
        <div
          className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"} ${device.gap}`}
        >
          {REFERRAL_OPPS.map((r, i) => (
            <div
              key={i}
              className={`${device.cardPadding} ${device.borderRadius} border flex flex-col ${
                r.primary
                  ? "border-brand-gold/25 bg-brand-gold/[0.04]"
                  : "border-[var(--app-border)] bg-[var(--app-card-bg)]"
              }`}
            >
              <div
                className={`font-body text-sm font-semibold mb-2 ${
                  r.primary ? "text-brand-gold" : "text-[var(--app-text)]"
                }`}
              >
                {r.title}
              </div>
              <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-4 flex-1">
                {r.body}
              </p>
              <button
                className={`w-full font-body text-[11px] tracking-[1px] uppercase rounded-lg px-4 py-2.5 transition-colors ${
                  r.primary
                    ? "bg-brand-gold text-black font-semibold hover:bg-brand-gold/90"
                    : "text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/10"
                }`}
              >
                {r.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
