"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";
import { fmt$ } from "@/lib/format";

/* ═══════════════════════════════════════════════════════════════════════════
   DEMO DATA
   ═══════════════════════════════════════════════════════════════════════════ */

interface Announcement {
  title: string;
  body: string;
  date: string;
  badge: string;
  badgeColor?: string;
}

const BADGE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  // Keyed by the badge *label* (legacy) — kept for backwards compat.
  New:       { bg: "bg-green-500/10",  border: "border-green-500/20",  text: "text-green-400" },
  Important: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400" },
  Update:    { bg: "bg-blue-500/10",   border: "border-blue-500/20",   text: "text-blue-400" },
};

// Secondary lookup — admin settings stores a `badgeColor` (green/yellow/blue/red/gray)
// alongside the free-text `badge` label. Prefer the color if present.
const BADGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  green:  { bg: "bg-green-500/10",  border: "border-green-500/20",  text: "text-green-400" },
  yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400" },
  blue:   { bg: "bg-blue-500/10",   border: "border-blue-500/20",   text: "text-blue-400" },
  red:    { bg: "bg-red-500/10",    border: "border-red-500/20",    text: "text-red-400" },
  gray:   { bg: "bg-white/5",       border: "border-white/10",      text: "text-white/70" },
};

function badgeStyle(a: Announcement) {
  if (a.badgeColor && BADGE_COLORS[a.badgeColor]) return BADGE_COLORS[a.badgeColor];
  return BADGE_STYLES[a.badge] || BADGE_COLORS.gray;
}

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

interface UpcomingEvent {
  icon: string;
  title: string;
  body: string;
  date: string;
  cta: string;
}

interface ReferralOpp {
  title: string;
  description: string;
  cta: string;
  highlighted: boolean;
}

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [referralOpps, setReferralOpps] = useState<ReferralOpp[]>([]);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [hiddenModules, setHiddenModules] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.settings?.leaderboardEnabled !== undefined) {
          setLeaderboardEnabled(d.settings.leaderboardEnabled);
        }
        const parseJsonArray = <T,>(value: unknown): T[] => {
          if (typeof value !== "string") return [];
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        };
        setAnnouncements(parseJsonArray<Announcement>(d?.settings?.announcements));
        setUpcomingEvents(parseJsonArray<UpcomingEvent>(d?.settings?.upcomingEvents));
        setReferralOpps(parseJsonArray<ReferralOpp>(d?.settings?.referralOpportunities));
        setVideoUrl(typeof d?.settings?.homeEmbedVideoUrl === "string" ? d.settings.homeEmbedVideoUrl : "");
        const hidden = parseJsonArray<string>(d?.settings?.homeHiddenModules);
        setHiddenModules(new Set(hidden.filter((x) => typeof x === "string")));
      })
      .catch(() => {});
  }, []);

  const isVisible = (id: string) => !hiddenModules.has(id);

  return (
    <div>
      {/* ══════════════════ WELCOME HEADER ══════════════════ */}
      <div className="mb-6 sm:mb-8 animate-fade-up text-center">
        <h1 className={`font-display ${device.headingSize} font-bold text-[var(--app-text)] mb-1`}>
          Welcome Back, {firstName}
        </h1>
        <p className="font-body text-[13px] text-[var(--app-text-muted)]">{formatDateHeading()}</p>
      </div>

      {/* ══════════════════ WELCOME VIDEO ══════════════════ */}
      {isVisible("video") && videoUrl && (
        <div className="mb-6 sm:mb-8 animate-fade-up flex justify-center">
          <div className="w-full max-w-3xl">
            <div className="relative w-full overflow-hidden rounded-lg border border-[var(--app-border)] bg-black" style={{ aspectRatio: "16 / 9" }}>
              <iframe
                src={videoUrl}
                className="absolute inset-0 h-full w-full"
                title="Welcome video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ SECTION 1: UPCOMING EVENTS (centered, top of feed) ══════════════════ */}
      {isVisible("events") && upcomingEvents.length > 0 && (
      <div className="mb-6 sm:mb-8 animate-fade-up max-w-4xl mx-auto">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-4 text-center">
          Upcoming Events
        </h2>
        <div
          className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"} ${device.gap}`}
        >
          {upcomingEvents.map((e, i) => (
            <div key={`${e.title}-${i}`} className={`card ${device.cardPadding} flex flex-col`}>
              {e.icon && <div className="text-3xl mb-3">{e.icon}</div>}
              <div className="font-body text-sm font-semibold text-[var(--app-text)] mb-1.5">
                {e.title}
              </div>
              <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-3 flex-1">
                {e.body}
              </p>
              {e.date && (
                <div className="font-body text-[11px] text-[var(--app-text-faint)] mb-4">{e.date}</div>
              )}
              {e.cta && (
                <button className="w-full font-body text-[11px] tracking-[1px] uppercase text-brand-gold border border-brand-gold/30 rounded-lg px-4 py-2.5 hover:bg-brand-gold/10 transition-colors">
                  {e.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ══════════════════ SECTION 2: ANNOUNCEMENTS (2-col card grid on desktop) ══════════════════ */}
      {isVisible("announcements") && announcements.length > 0 && (
      <div className="mb-6 sm:mb-8 animate-fade-up">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-4 text-center">
          Announcements
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {announcements.map((a, idx) => {
            const badge = badgeStyle(a);
            return (
              <div
                key={`${a.title}-${idx}`}
                className="card border-l-2 border-l-brand-gold overflow-hidden"
              >
                <div className="px-4 sm:px-6 py-4 sm:py-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="font-body text-sm font-semibold text-[var(--app-text)] leading-snug">
                      {a.title}
                    </div>
                    {a.badge && (
                      <span
                        className={`${badge.bg} ${badge.border} ${badge.text} border rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase shrink-0`}
                      >
                        {a.badge}
                      </span>
                    )}
                  </div>
                  <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-2">
                    {a.body}
                  </p>
                  {a.date && (
                    <div className="font-body text-[11px] text-[var(--app-text-faint)]">{a.date}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* ══════════════════ SECTION 3: LEADERBOARD ══════════════════ */}
      {leaderboardEnabled && isVisible("leaderboard") && <div className="mb-6 sm:mb-8 animate-fade-up">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-1 text-center">
          Partner Leaderboard &mdash; March 2026
        </h2>
        <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-4 text-center">
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

      {/* ══════════════════ SECTION 4: REFERRAL OPPORTUNITIES ══════════════════ */}
      {isVisible("opportunities") && referralOpps.length > 0 && (
      <div className="animate-fade-up">
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-1 text-center">
          Expand Your Earnings
        </h2>
        <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-4 text-center">
          Additional referral opportunities to grow your income with {FIRM_SHORT}
        </p>
        <div
          className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"} ${device.gap}`}
        >
          {referralOpps.map((r, i) => (
            <div
              key={`${r.title}-${i}`}
              className={`${device.cardPadding} ${device.borderRadius} border flex flex-col ${
                r.highlighted
                  ? "border-brand-gold/25 bg-brand-gold/[0.04]"
                  : "border-[var(--app-border)] bg-[var(--app-card-bg)]"
              }`}
            >
              <div
                className={`font-body text-sm font-semibold mb-2 ${
                  r.highlighted ? "text-brand-gold" : "text-[var(--app-text)]"
                }`}
              >
                {r.title}
              </div>
              <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-4 flex-1">
                {r.description}
              </p>
              {r.cta && (
                <button
                  className={`w-full font-body text-[11px] tracking-[1px] uppercase rounded-lg px-4 py-2.5 transition-colors ${
                    r.highlighted
                      ? "bg-brand-gold text-black font-semibold hover:bg-brand-gold/90"
                      : "text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/10"
                  }`}
                >
                  {r.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

    </div>
  );
}
