"use client";

import { useState, useEffect } from "react";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import VideoModal from "@/components/ui/VideoModal";

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
}

/* ── Demo fallback data ────────────────────────────────────────────────── */

const DEMO_ACTIVE: ConferenceEntry = {
  id: "demo-active",
  title: "Weekly Partner Training & Q&A",
  description: "Product updates, training topics, success stories, and live Q&A.",
  embedUrl: null,
  joinUrl: "#",
  recordingUrl: null,
  schedule: "Every Thursday at 2:00 PM ET — 45-60 minutes",
  nextCall: new Date().toISOString(),
  hostName: "TRLN Leadership Team",
  duration: null,
  weekNumber: null,
  notes: null,
  isActive: true,
};

const DEMO_RECORDINGS: ConferenceEntry[] = [
  { id: "d1", title: "Section 301 Update & New Partner Tools", description: null, embedUrl: null, joinUrl: null, recordingUrl: "#", schedule: null, nextCall: "2026-03-19T18:00:00Z", hostName: "Sarah Mitchell", duration: "52 min", weekNumber: 12, notes: null, isActive: false },
  { id: "d2", title: "Commission Deep Dive & Top Partner Q&A", description: null, embedUrl: null, joinUrl: null, recordingUrl: "#", schedule: null, nextCall: "2026-03-12T18:00:00Z", hostName: "John Orlando", duration: "47 min", weekNumber: 11, notes: null, isActive: false },
  { id: "d3", title: "IEEPA Changes & Client Outreach Strategies", description: null, embedUrl: null, joinUrl: null, recordingUrl: "#", schedule: null, nextCall: "2026-03-05T19:00:00Z", hostName: "Sarah Mitchell", duration: "58 min", weekNumber: 10, notes: null, isActive: false },
  { id: "d4", title: "Onboarding Best Practices for New Partners", description: null, embedUrl: null, joinUrl: null, recordingUrl: "#", schedule: null, nextCall: "2026-02-26T19:00:00Z", hostName: "TRLN Leadership Team", duration: "41 min", weekNumber: 9, notes: null, isActive: false },
];

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
  a.download = "trln-weekly-call.ics";
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
  const [videoModal, setVideoModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false, url: "", title: "",
  });

  useEffect(() => {
    fetch("/api/conference")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setActiveSchedule(data.activeSchedule || DEMO_ACTIVE);
        setPastRecordings(data.pastRecordings?.length ? data.pastRecordings : DEMO_RECORDINGS);
      })
      .catch(() => {
        setActiveSchedule(DEMO_ACTIVE);
        setPastRecordings(DEMO_RECORDINGS);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-white/40">Loading conference data...</div>
      </div>
    );
  }

  const active = activeSchedule || DEMO_ACTIVE;
  const callInfo = formatCallDate(active.nextCall);

  return (
    <div>
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Live Weekly Call!
      </h2>
      <p className="font-body text-[13px] text-white/40 mb-6">
        Join our weekly team call for product updates, training, success stories, and live Q&A.
      </p>

      {/* ═══ NEXT CALL CARD ═══ */}
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
        <div className={`font-display ${device.isMobile ? "text-xl" : "text-2xl"} font-bold text-white mb-2`}>
          {active.title}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
          <span className="font-body text-[13px] text-white/60">📅 {callInfo.date}</span>
          {callInfo.time && <span className="font-body text-[13px] text-white/60">⏰ {callInfo.time}</span>}
          {active.hostName && <span className="font-body text-[13px] text-white/60">👤 {active.hostName}</span>}
        </div>
        <div className={`flex ${device.isMobile ? "flex-col" : ""} gap-3`}>
          <button
            onClick={() => active.joinUrl && window.open(active.joinUrl, "_blank")}
            className="btn-gold text-[13px] px-6 py-3 flex items-center justify-center gap-2"
          >
            📹 Join Call
          </button>
          <button
            onClick={() => generateICS(active)}
            className="font-body text-[12px] text-white/50 border border-white/10 rounded-lg px-5 py-3 hover:text-white/70 hover:border-white/20 transition-colors text-center"
          >
            Add to Calendar
          </button>
        </div>
      </div>

      {/* ═══ CALL SCHEDULE ═══ */}
      <div className={`card ${device.cardPadding} mb-6`}>
        <div className="font-body font-semibold text-sm mb-3">Call Schedule</div>
        <div className="font-body text-[13px] text-white/50 leading-relaxed">
          {active.schedule || (
            <>
              Every <strong className="text-white/70">Thursday at 2:00 PM ET</strong> — Our weekly partner call covers product updates,
              training topics, success stories from top partners, and an open Q&A session. All partners are welcome.
              Calls typically last 45–60 minutes.
            </>
          )}
        </div>
      </div>

      {/* ═══ PAST RECORDINGS ═══ */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06]">
          <div className="font-body font-semibold text-sm">Past Recordings</div>
        </div>
        {pastRecordings.map((rec) => (
          <div key={rec.id} className="border-b border-white/[0.04] last:border-b-0">
            <div className="px-4 sm:px-6 py-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-body text-[13px] text-white/80 truncate">
                  {rec.weekNumber ? `Week ${rec.weekNumber} — ` : ""}{rec.title}
                </div>
                <div className="font-body text-[11px] text-white/30 mt-0.5">
                  {fmtDate(rec.nextCall)} · {rec.duration || "—"}{rec.hostName ? ` · ${rec.hostName}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {rec.notes && (
                  <button
                    onClick={() => toggleNotes(rec.id)}
                    className="font-body text-[11px] text-white/40 border border-white/10 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.04] transition-colors"
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
              <div className="px-4 sm:px-6 pb-4 border-t border-white/[0.04]">
                <div className="font-body text-[12px] text-white/50 leading-relaxed whitespace-pre-line pt-3">
                  {rec.notes}
                </div>
              </div>
            )}
          </div>
        ))}
        {pastRecordings.length === 0 && (
          <div className="px-4 sm:px-6 py-8 text-center">
            <div className="font-body text-[13px] text-white/30">No past recordings available yet.</div>
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
