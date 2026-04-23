"use client";

import { useState, useEffect } from "react";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import VideoModal from "@/components/ui/VideoModal";
import PageTabBar from "@/components/ui/PageTabBar";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface ConferenceEntry {
  id: string;
  title: string;
  description: string | null;
  embedUrl: string | null;
  joinUrl: string | null;
  recordingUrl: string | null;
  schedule: string | null;
  nextCall: string | null;
  hostName: string | null;
  duration: string | null;
  weekNumber: number | null;
  notes: string | null;
  isActive: boolean;
  jitsiRoom?: string | null;
}

/* ── ICS helper ────────────────────────────────────────────────────────── */

function generateICS(entry: ConferenceEntry) {
  const start = entry.nextCall ? new Date(entry.nextCall) : new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${FIRM_SHORT}//Partner Portal//EN`,
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${entry.title}`,
    `DESCRIPTION:${entry.description || `Weekly ${FIRM_SHORT} partner call`}`,
    entry.joinUrl ? `URL:${entry.joinUrl}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fintella-weekly-call.ics";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Format next-call date for display ─────────────────────────────────── */

function formatCallDate(dateStr: string | null): { date: string; time: string } {
  if (!dateStr) return { date: "TBD", time: "" };
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return { date, time };
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ConferencePage() {
  const device = useDevice();
  const [loading, setLoading] = useState(true);
  const [activeSchedule, setActiveSchedule] = useState<ConferenceEntry | null>(null);
  const [pastRecordings, setPastRecordings] = useState<ConferenceEntry[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [jitsiOpen, setJitsiOpen] = useState(false);
  const [videoModal, setVideoModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false, url: "", title: "",
  });
  // Admin-uploaded banner image (PortalSettings.liveWeeklyBannerUrl).
  // When set, shown centered at the top of this page in place of the
  // default text-only header.
  const [bannerUrl, setBannerUrl] = useState<string>("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.settings?.liveWeeklyBannerUrl) setBannerUrl(d.settings.liveWeeklyBannerUrl); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/conference")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        // Show real data — even when empty. The pre-launch DEMO_ACTIVE /
        // DEMO_RECORDINGS fallbacks confused partners in production by
        // displaying fake Zoom links, fake recording titles, and "Next
        // Call: Weekly Partner Training & Q&A" when there was actually
        // nothing scheduled yet.
        setActiveSchedule(data.activeSchedule ?? null);
        setPastRecordings(Array.isArray(data.pastRecordings) ? data.pastRecordings : []);
      })
      .catch(() => {
        setActiveSchedule(null);
        setPastRecordings([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleNotes = (id: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openVideo = (url: string, title: string) => setVideoModal({ isOpen: true, url, title });
  const closeVideo = () => setVideoModal({ isOpen: false, url: "", title: "" });

  const communicationsTabs = (
    <PageTabBar
      title="Communications"
      tabs={[
        { label: "Live Weekly Call", href: "/dashboard/conference" },
        { label: "Announcements", href: "/dashboard/announcements" },
        { label: "Messages", href: "/dashboard/messages" },
        { label: "Notifications", href: "/dashboard/notifications" },
      ]}
    />
  );

  if (loading) {
    return (
      <div>
        {communicationsTabs}
        <div className="flex items-center justify-center py-20">
          <div className="font-body text-sm text-[var(--app-text-muted)]">Loading conference data...</div>
        </div>
      </div>
    );
  }

  const active = activeSchedule;
  const callInfo = active ? formatCallDate(active.nextCall) : { date: "", time: "" };

  return (
    <div>
      {communicationsTabs}
      {bannerUrl && (
        <div className="flex justify-center mb-6">
          <img
            src={bannerUrl}
            alt="Live Weekly Call"
            className="max-h-80 w-auto rounded-xl border"
            style={{ borderColor: "var(--app-border)" }}
          />
        </div>
      )}
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Live Weekly Call!
      </h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-6">
        Join our weekly team call for product updates, training, success stories, and live Q&A.
      </p>

      {/* ═══ NEXT CALL CARD / EMPTY STATE ═══ */}
      {!active ? (
        <div className={`${device.cardPadding} ${device.borderRadius} border border-[var(--app-border)] bg-[var(--app-card-bg)] mb-6 text-center`}>
          <div className="font-body text-[11px] tracking-[1.5px] uppercase text-[var(--app-text-muted)] mb-2">No Live Call Scheduled</div>
          <div className="font-body text-[13px] text-[var(--app-text-secondary)]">
            Check back soon — the next Live Weekly will appear here once it's been scheduled.
          </div>
        </div>
      ) : (
      <div className={`${device.cardPadding} ${device.borderRadius} border border-brand-gold/25 bg-gradient-to-br from-brand-gold/[0.06] to-brand-gold/[0.02] mb-6`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <div className="font-body text-[11px] tracking-[1.5px] uppercase text-green-400 font-semibold">
            Next Live Call
          </div>
        </div>
        <div className={`font-display ${device.isMobile ? "text-xl" : "text-2xl"} font-bold text-[var(--app-text)] mb-2`}>
          {active.title}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
          <span className="font-body text-[13px] text-[var(--app-text-secondary)]">📅 {callInfo.date}</span>
          {callInfo.time && <span className="font-body text-[13px] text-[var(--app-text-secondary)]">⏰ {callInfo.time}</span>}
          {active.hostName && <span className="font-body text-[13px] text-[var(--app-text-secondary)]">👤 {active.hostName}</span>}
        </div>
        <div className={`flex ${device.isMobile ? "flex-col" : ""} gap-3`}>
          {active.jitsiRoom ? (
            <button
              onClick={() => setJitsiOpen((v) => !v)}
              className="btn-gold text-[13px] px-6 py-3 flex items-center justify-center gap-2"
            >
              📹 {jitsiOpen ? "Hide call" : "Join call here"}
            </button>
          ) : (
            <button
              onClick={() => active.joinUrl && window.open(active.joinUrl, "_blank")}
              className="btn-gold text-[13px] px-6 py-3 flex items-center justify-center gap-2"
            >
              📹 Join Call
            </button>
          )}
          {active.jitsiRoom && (
            <a
              href={`https://meet.jit.si/${active.jitsiRoom}`}
              target="_blank"
              rel="noreferrer"
              className="font-body text-[12px] text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-5 py-3 hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)] transition-colors text-center"
              title="Open in a new tab"
            >
              Open in new tab
            </a>
          )}
          <button
            onClick={() => generateICS(active)}
            className="font-body text-[12px] text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-5 py-3 hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)] transition-colors text-center"
          >
            Add to Calendar
          </button>
        </div>

        {/* In-portal Jitsi embed — Jitsi allows iframe embedding (unlike
            Meet/Zoom/SignWell). Partners click "Join call here" and get
            the video conference right inside their dashboard. */}
        {jitsiOpen && active.jitsiRoom && (
          <div className="mt-4 rounded-xl overflow-hidden border border-[var(--app-border)] bg-black" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              src={`https://meet.jit.si/${active.jitsiRoom}`}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full h-full"
              title={active.title}
            />
          </div>
        )}
      </div>
      )}

      {/* ═══ CALL SCHEDULE ═══ */}
      {active && (
      <div className={`card ${device.cardPadding} mb-6`}>
        <div className="font-body font-semibold text-sm mb-3">Call Schedule</div>
        <div className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed">
          {active.schedule || (
            <>
              Every <strong className="text-[var(--app-text-secondary)]">Thursday at 2:00 PM ET</strong> — Our weekly partner call covers product updates,
              training topics, success stories from top partners, and an open Q&A session. All partners are welcome.
              Calls typically last 45–60 minutes.
            </>
          )}
        </div>
      </div>
      )}

      {/* ═══ PAST RECORDINGS ═══ */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 border-b border-[var(--app-border)]">
          <div className="font-body font-semibold text-sm">Past Recordings</div>
        </div>
        {pastRecordings.length === 0 && (
          <div className="px-4 sm:px-6 py-10 text-center font-body text-[13px] text-[var(--app-text-muted)]">
            No recordings available yet.
          </div>
        )}
        {pastRecordings.map((rec) => (
          <div key={rec.id} className="border-b border-[var(--app-border)] last:border-b-0">
            <div className="px-4 sm:px-6 py-4 hover:bg-[var(--app-card-bg)] transition-colors flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-body text-[13px] text-[var(--app-text)] truncate">
                  {rec.weekNumber ? `Week ${rec.weekNumber} — ` : ""}{rec.title}
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                  {fmtDate(rec.nextCall)} · {rec.duration || "—"}{rec.hostName ? ` · ${rec.hostName}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {rec.notes && (
                  <button
                    onClick={() => toggleNotes(rec.id)}
                    className="font-body text-[11px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-2.5 py-1.5 hover:bg-[var(--app-card-bg)] transition-colors"
                    title="Toggle notes"
                  >
                    {expandedNotes.has(rec.id) ? "▲ Notes" : "▼ Notes"}
                  </button>
                )}
                {(rec.embedUrl || rec.recordingUrl) && (
                  <button
                    onClick={() => {
                      if (rec.embedUrl) {
                        openVideo(rec.embedUrl, rec.title);
                      } else if (rec.recordingUrl) {
                        window.open(rec.recordingUrl, "_blank");
                      }
                    }}
                    className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
                  >
                    ▶ Watch
                  </button>
                )}
              </div>
            </div>
            {/* Expandable notes */}
            {rec.notes && expandedNotes.has(rec.id) && (
              <div className="px-4 sm:px-6 pb-4 border-t border-[var(--app-border)]">
                <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-relaxed whitespace-pre-line pt-3">
                  {rec.notes}
                </div>
              </div>
            )}
          </div>
        ))}
        {pastRecordings.length === 0 && (
          <div className="px-4 sm:px-6 py-8 text-center">
            <div className="font-body text-[13px] text-[var(--app-text-muted)]">No past recordings available yet.</div>
          </div>
        )}
      </div>

      {/* Video modal for inline playback */}
      <VideoModal
        isOpen={videoModal.isOpen}
        onClose={closeVideo}
        videoUrl={videoModal.url}
        title={videoModal.title}
      />
    </div>
  );
}
