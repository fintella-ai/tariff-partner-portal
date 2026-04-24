"use client";

import { useState, useEffect, Fragment } from "react";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";
import { fmt$ } from "@/lib/format";
import { GettingStartedChecklist } from "@/components/partner/GettingStartedChecklist";
import { markGettingStartedVideoWatched } from "@/lib/markGettingStarted";
import GlossaryText from "@/components/ui/GlossaryText";
import EditableText from "@/components/ui/EditableText";
import EditableSection from "@/components/ui/EditableSection";
import { useEditLayout } from "@/components/admin/EditLayoutContext";

/* ═══════════════════════════════════════════════════════════════════════════
   DEMO DATA
   ═══════════════════════════════════════════════════════════════════════════ */

interface Announcement {
  title: string;
  body: string;
  date: string;
  badge: string;
  badgeColor?: string;
  highlighted?: boolean;
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
  ctaUrl?: string;
  highlighted?: boolean;
}

interface ReferralOpp {
  title: string;
  description: string;
  cta: string;
  ctaUrl?: string;
  highlighted: boolean;
}

interface LiveWeeklyCall {
  id: string;
  title: string;
  nextCall: string | null;
  hostName: string | null;
  jitsiRoom: string | null;
  joinUrl: string | null;
}

function formatNextCall(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${date} · ${time}`;
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

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function HomePage() {
  const device = useDevice();
  const { getSection } = useEditLayout();
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [referralOpps, setReferralOpps] = useState<ReferralOpp[]>([]);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [liveWeeklyBannerUrl, setLiveWeeklyBannerUrl] = useState<string>("");
  const [liveWeeklyCall, setLiveWeeklyCall] = useState<LiveWeeklyCall | null>(null);
  // Count of downline partners waiting on an L1↔downline agreement upload.
  // Drives the top-of-home callout that deep-links to /dashboard/downline.
  // Includes L2 direct children + L3 grandchildren in statuses
  // "pending", "invited", or "under_review".
  const [pendingAgreementCount, setPendingAgreementCount] = useState<number>(0);
  const [hiddenModules, setHiddenModules] = useState<Set<string>>(new Set());
  const DEFAULT_ORDER = ["getting_started", "video", "liveWeekly", "events", "announcements", "leaderboard", "opportunities"];
  const [moduleOrder, setModuleOrder] = useState<string[]>(DEFAULT_ORDER);
  type ModuleLayout = { columns?: 1 | 2 | 3; alignment?: "left" | "center" };
  const [moduleLayout, setModuleLayout] = useState<Record<string, ModuleLayout>>({});

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
        setLiveWeeklyBannerUrl(typeof d?.settings?.liveWeeklyBannerUrl === "string" ? d.settings.liveWeeklyBannerUrl : "");
        const hidden = parseJsonArray<string>(d?.settings?.homeHiddenModules);
        setHiddenModules(new Set(hidden.filter((x) => typeof x === "string")));
        // Module order: keep admin-saved order, append any defaults that
        // weren't in the saved list so a newly-added module shows up.
        const savedOrder = parseJsonArray<string>(d?.settings?.homeModuleOrder);
        const known = savedOrder.filter((x) => typeof x === "string" && DEFAULT_ORDER.includes(x));
        const missing = DEFAULT_ORDER.filter((id) => !known.includes(id));
        setModuleOrder([...known, ...missing]);
        try {
          const layout = JSON.parse(d?.settings?.homeModuleLayout || "{}");
          if (layout && typeof layout === "object") setModuleLayout(layout);
        } catch {}
      })
      .catch(() => {});
    // Downline partners pending an L1↔downline agreement upload.
    // Reuses /api/deals which already returns L2 + L3 downline rows.
    fetch("/api/deals")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const needsAgreement = (p: any) => ["pending", "invited", "under_review"].includes(p?.status);
        const l2 = Array.isArray(d?.downlinePartners) ? d.downlinePartners.filter(needsAgreement) : [];
        const l3 = Array.isArray(d?.l3Partners) ? d.l3Partners.filter(needsAgreement) : [];
        setPendingAgreementCount(l2.length + l3.length);
      })
      .catch(() => {});
    // Active Live Weekly schedule — fuels the Live Weekly home module.
    // Endpoint returns { activeSchedule, pastRecordings }; we only need
    // the active row's title + nextCall + host.
    fetch("/api/conference")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const a = d?.activeSchedule;
        if (a && typeof a === "object") {
          setLiveWeeklyCall({
            id: String(a.id),
            title: String(a.title ?? "Live Weekly Call"),
            nextCall: a.nextCall ?? null,
            hostName: a.hostName ?? null,
            jitsiRoom: a.jitsiRoom ?? null,
            joinUrl: a.joinUrl ?? null,
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Getting-Started: mark the welcome video as watched after 30s on the
  // home page when a video is configured. Fair heuristic — a partner who
  // loads home with a real video URL and stays half a minute has seen the
  // video slot. We can't detect actual play inside a third-party iframe
  // (cross-origin), so this is the best passive signal without adding an
  // explicit "I watched it" button to the UI.
  useEffect(() => {
    if (!videoUrl || hiddenModules.has("video")) return;
    const timer = window.setTimeout(() => {
      markGettingStartedVideoWatched();
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [videoUrl, hiddenModules]);

  const isVisible = (id: string) => !hiddenModules.has(id);
  const getLayout = (id: string, defaults: ModuleLayout = {}): Required<ModuleLayout> => {
    const saved = moduleLayout[id] || {};
    return {
      columns: (saved.columns ?? defaults.columns ?? 3) as 1 | 2 | 3,
      alignment: (saved.alignment ?? defaults.alignment ?? "center") as "left" | "center",
    };
  };
  // Map columns number to Tailwind grid classes. Mobile always 1 col.
  const colsClass = (n: 1 | 2 | 3) =>
    n === 1 ? "grid-cols-1"
    : n === 2 ? "grid-cols-1 md:grid-cols-2"
    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  // Alignment wrapper — center uses max-w-4xl mx-auto; left is full-width.
  const alignWrap = (align: "left" | "center") =>
    align === "center" ? "max-w-4xl mx-auto" : "";

  // ─── Section renderers ─────────────────────────────────────────────
  // Each returns null when the module is hidden or has no content to render.
  // Human-friendly labels for the edit-mode Hide/Show overlay.
  const SECTION_TITLES: Record<string, string> = {
    events: "Upcoming Events",
    announcements: "Announcements",
    opportunities: "Referral Opportunities",
    leaderboard: "Leaderboard",
    video: "Welcome Video",
    liveWeekly: "Live Weekly Call",
    getting_started: "Getting Started",
  };
  // Phase C — compute the effective render order by sorting the admin's
  // homeModuleOrder with any star-admin-saved `order` overrides layered on
  // top. Sections with a saved order win; unsaved sections keep their
  // default index as the tiebreaker so the list stays stable during an
  // in-progress reorder.
  const effectiveOrderFor = (id: string, defaultIdx: number): number => {
    const override = getSection(`home.${id}`);
    return typeof override?.order === "number" ? override.order : defaultIdx;
  };
  const orderedModuleIds = [...moduleOrder]
    .map((id, idx) => ({ id, order: effectiveOrderFor(id, idx), defaultIdx: idx }))
    .sort((a, b) => a.order - b.order || a.defaultIdx - b.defaultIdx);
  // Position lookup so each EditableSection can announce its prev/next
  // neighbor's id + effective order for swap-based reordering.
  const sortedIds = orderedModuleIds.map((r) => r.id);
  const orderById: Record<string, number> = {};
  for (const row of orderedModuleIds) orderById[row.id] = row.order;
  const sectionWrap = (id: string, children: React.ReactNode, defaults: ModuleLayout = {}) => {
    const { alignment } = getLayout(id, defaults);
    const pos = sortedIds.indexOf(id);
    const prevDefaultId = pos > 0 ? sortedIds[pos - 1] : null;
    const nextDefaultId = pos >= 0 && pos < sortedIds.length - 1 ? sortedIds[pos + 1] : null;
    const prev = prevDefaultId
      ? { id: `home.${prevDefaultId}`, effectiveOrder: orderById[prevDefaultId] }
      : null;
    const next = nextDefaultId
      ? { id: `home.${nextDefaultId}`, effectiveOrder: orderById[nextDefaultId] }
      : null;
    return (
      <EditableSection
        id={`home.${id}`}
        title={SECTION_TITLES[id] || id}
        effectiveOrder={orderById[id]}
        prev={prev}
        next={next}
      >
        <div className={`mb-6 sm:mb-8 animate-fade-up ${alignWrap(alignment)}`}>
          {children}
        </div>
      </EditableSection>
    );
  };

  const renderVideo = () => {
    if (!isVisible("video") || !videoUrl) return null;
    const { alignment } = getLayout("video", { alignment: "center" });
    return (
      <div className={`mb-6 sm:mb-8 animate-fade-up ${alignment === "center" ? "flex justify-center" : ""}`}>
        <div className={`w-full ${alignment === "center" ? "max-w-3xl" : ""}`}>
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
    );
  };

  const renderLiveWeekly = () => {
    if (!isVisible("liveWeekly")) return null;
    // Only render when there's something to show — a banner image
    // OR a scheduled call. Keeps the home page clean when neither
    // is configured yet.
    if (!liveWeeklyBannerUrl && !liveWeeklyCall) return null;
    const { alignment } = getLayout("liveWeekly", { alignment: "center" });
    const nextCallStr = formatNextCall(liveWeeklyCall?.nextCall ?? null);
    return (
      <div className={`mb-6 sm:mb-8 animate-fade-up ${alignment === "center" ? alignWrap("center") : ""}`}>
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-4 text-center">Live Weekly Call</h2>
        {liveWeeklyBannerUrl && (
          <div className="flex justify-center mb-4">
            <img
              src={liveWeeklyBannerUrl}
              alt="Live Weekly Call"
              className="max-h-64 w-auto rounded-xl border"
              style={{ borderColor: "var(--app-border)" }}
            />
          </div>
        )}
        {liveWeeklyCall ? (
          <div className={`${device.cardPadding} ${device.borderRadius} border border-brand-gold/25 bg-gradient-to-br from-brand-gold/[0.06] to-brand-gold/[0.02] text-center`}>
            <div className={`font-display ${device.isMobile ? "text-lg" : "text-xl"} font-bold text-[var(--app-text)] mb-1.5`}>
              {liveWeeklyCall.title}
            </div>
            {(nextCallStr || liveWeeklyCall.hostName) && (
              <div className="font-body text-[13px] text-[var(--app-text-secondary)] mb-4">
                {nextCallStr}
                {nextCallStr && liveWeeklyCall.hostName && <span className="mx-2 text-[var(--app-text-faint)]">·</span>}
                {liveWeeklyCall.hostName}
              </div>
            )}
            {(() => {
              // Prefer the in-portal Jitsi room when one is configured;
              // fall back to an external Zoom/Meet joinUrl; otherwise
              // deep-link to the conference page which has its own
              // Jitsi embed + external-link fallback.
              const href = liveWeeklyCall.jitsiRoom
                ? `https://meet.jit.si/${liveWeeklyCall.jitsiRoom}`
                : (liveWeeklyCall.joinUrl || "/dashboard/conference");
              const external = href.startsWith("http");
              return (
                <a
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  className="inline-block btn-gold text-[13px] px-6 py-2.5"
                >
                  Join the Call
                </a>
              );
            })()}
          </div>
        ) : (
          <div className="text-center">
            <a
              href="/dashboard/conference"
              className="inline-block font-body text-[12px] text-brand-gold/80 border border-brand-gold/30 rounded-lg px-4 py-2 hover:bg-brand-gold/10 transition-colors"
            >
              View weekly call details →
            </a>
          </div>
        )}
      </div>
    );
  };

  const renderEvents = () => {
    if (!isVisible("events") || upcomingEvents.length === 0) return null;
    const { columns } = getLayout("events", { columns: 3, alignment: "center" });
    return sectionWrap("events", (
      <>
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-4 text-center">Upcoming Events</h2>
        <div className={`grid ${colsClass(columns)} ${device.gap}`}>
          {upcomingEvents.map((e, i) => (
            <div
              key={`${e.title}-${i}`}
              className={`${device.cardPadding} ${device.borderRadius} border flex flex-col text-center ${
                e.highlighted
                  ? "border-brand-gold/25 bg-brand-gold/[0.04]"
                  : "border-[var(--app-border)] bg-[var(--app-card-bg)]"
              }`}
            >
              {e.icon && <div className="text-3xl mb-3">{e.icon}</div>}
              <div className={`font-body text-sm font-semibold mb-1.5 ${e.highlighted ? "text-brand-gold" : "text-[var(--app-text)]"}`}>{e.title}</div>
              <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-3 flex-1">{e.body}</p>
              {e.date && <div className="font-body text-[11px] text-[var(--app-text-faint)] mb-4">{e.date}</div>}
              {e.cta && e.ctaUrl && (
                <a
                  href={e.ctaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`block w-full text-center font-body text-[11px] tracking-[1px] uppercase rounded-lg px-4 py-2.5 transition-colors ${
                    e.highlighted
                      ? "bg-brand-gold text-black font-semibold hover:bg-brand-gold/90"
                      : "text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/10"
                  }`}
                >
                  {e.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      </>
    ), { columns: 3, alignment: "center" });
  };

  const renderAnnouncements = () => {
    if (!isVisible("announcements") || announcements.length === 0) return null;
    const { columns } = getLayout("announcements", { columns: 2, alignment: "left" });
    return sectionWrap("announcements", (
      <>
        <EditableText
          id="home.announcements.title"
          fallback="Announcements"
          as="h2"
          className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-4 text-center"
        />
        <div className={`grid ${colsClass(columns)} gap-3`}>
          {announcements.map((a, idx) => {
            const badge = badgeStyle(a);
            return (
              <div
                key={`${a.title}-${idx}`}
                className={`card border-l-2 overflow-hidden ${
                  a.highlighted
                    ? "border-l-brand-gold border-brand-gold/25 bg-brand-gold/[0.04]"
                    : "border-l-brand-gold"
                }`}
              >
                <div className="px-4 sm:px-6 py-4 sm:py-5 text-center">
                  {a.badge && (
                    <span className={`${badge.bg} ${badge.border} ${badge.text} inline-block border rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase mb-2`}>
                      {a.badge}
                    </span>
                  )}
                  <div className={`font-body text-sm font-semibold leading-snug mb-2 ${a.highlighted ? "text-brand-gold" : "text-[var(--app-text)]"}`}>
                    {a.title}
                  </div>
                  <GlossaryText
                    text={a.body}
                    className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-2 block"
                  />
                  {a.date && <div className="font-body text-[11px] text-[var(--app-text-faint)]">{a.date}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </>
    ), { columns: 2, alignment: "left" });
  };

  const renderOpportunities = () => {
    if (!isVisible("opportunities") || referralOpps.length === 0) return null;
    const { columns } = getLayout("opportunities", { columns: 3, alignment: "left" });
    return sectionWrap("opportunities", (
      <>
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-1 text-center">Expand Your Earnings</h2>
        <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-4 text-center">
          Additional referral opportunities to grow your income with {FIRM_SHORT}
        </p>
        <div className={`grid ${colsClass(columns)} ${device.gap}`}>
          {referralOpps.map((r, i) => (
            <div
              key={`${r.title}-${i}`}
              className={`${device.cardPadding} ${device.borderRadius} border flex flex-col text-center ${
                r.highlighted ? "border-brand-gold/25 bg-brand-gold/[0.04]" : "border-[var(--app-border)] bg-[var(--app-card-bg)]"
              }`}
            >
              <div className={`font-body text-sm font-semibold mb-2 ${r.highlighted ? "text-brand-gold" : "text-[var(--app-text)]"}`}>{r.title}</div>
              <p className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed mb-4 flex-1">{r.description}</p>
              {r.cta && r.ctaUrl && (
                <a
                  href={r.ctaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`block w-full text-center font-body text-[11px] tracking-[1px] uppercase rounded-lg px-4 py-2.5 transition-colors ${
                    r.highlighted ? "bg-brand-gold text-black font-semibold hover:bg-brand-gold/90" : "text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/10"
                  }`}
                >
                  {r.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      </>
    ), { columns: 3, alignment: "left" });
  };

  const renderLeaderboard = () => {
    if (!leaderboardEnabled || !isVisible("leaderboard")) return null;
    return sectionWrap("leaderboard", (
      <>
        <h2 className="font-body text-xs tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-1 text-center">
          Partner Leaderboard &mdash; March 2026
        </h2>
        <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-4 text-center">
          Top performers this month (names hidden for privacy)
        </p>
        <div className="card overflow-hidden">{renderLeaderboardTable()}</div>
      </>
    ), { alignment: "left" });
  };

  const renderLeaderboardTable = () => (
    <>
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
    </>
  );

  const renderGettingStarted = () => {
    if (!isVisible("getting_started")) return null;
    return (
      <div className="mb-6 sm:mb-8 animate-fade-up max-w-4xl mx-auto">
        <GettingStartedChecklist variant="home" />
      </div>
    );
  };

  // ─── Dispatch ──────────────────────────────────────────────────────
  const dispatchModule = (id: string): React.ReactNode => {
    switch (id) {
      case "getting_started": return renderGettingStarted();
      case "video": return renderVideo();
      case "liveWeekly": return renderLiveWeekly();
      case "events": return renderEvents();
      case "announcements": return renderAnnouncements();
      case "leaderboard": return renderLeaderboard();
      case "opportunities": return renderOpportunities();
      default: return null;
    }
  };

  return (
    <div>
      {/* Downline-agreement callout — visible when the logged-in partner
          has one or more L2/L3 downline rows waiting on an upload. Links
          straight to /dashboard/downline where the upload UI lives. */}
      {pendingAgreementCount > 0 && (
        <a
          href="/dashboard/downline"
          className="mb-6 sm:mb-8 flex items-center justify-center gap-3 rounded-xl border border-yellow-500/25 bg-yellow-500/[0.06] px-4 py-3 font-body text-[13px] text-yellow-400 hover:bg-yellow-500/[0.1] transition-colors"
        >
          <span aria-hidden>📝</span>
          <span className="font-semibold">Downline Agreements Need Your Upload</span>
          <span className="text-yellow-400/70">→</span>
        </a>
      )}
      {/* Welcome header + date now live in the shared dashboard layout.
          The home page renders only its admin-ordered module body. */}
      {moduleOrder.map((id) => {
        const node = dispatchModule(id);
        return node ? <Fragment key={id}>{node}</Fragment> : null;
      })}
    </div>
  );
}
