"use client";

import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";

const NEXT_CALL = {
  title: "Weekly Partner Training & Q&A",
  date: "Thursday, March 27, 2025",
  time: "2:00 PM — 3:00 PM ET",
  host: "TRRLN Leadership Team",
  joinUrl: "#", // Will be replaced with actual Zoom/Meet link
};

const PAST_RECORDINGS = [
  { title: "Week 12 — Section 301 Update & New Partner Tools", date: "Mar 20, 2025", duration: "52 min", url: "#" },
  { title: "Week 11 — Commission Deep Dive & Top Partner Q&A", date: "Mar 13, 2025", duration: "47 min", url: "#" },
  { title: "Week 10 — IEEPA Changes & Client Outreach Strategies", date: "Mar 6, 2025", duration: "58 min", url: "#" },
  { title: "Week 9 — Onboarding Best Practices for New Partners", date: "Feb 27, 2025", duration: "41 min", url: "#" },
];

export default function ConferencePage() {
  const device = useDevice();

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
          {NEXT_CALL.title}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
          <span className="font-body text-[13px] text-white/60">📅 {NEXT_CALL.date}</span>
          <span className="font-body text-[13px] text-white/60">⏰ {NEXT_CALL.time}</span>
          <span className="font-body text-[13px] text-white/60">👤 {NEXT_CALL.host}</span>
        </div>
        <div className={`flex ${device.isMobile ? "flex-col" : ""} gap-3`}>
          <button className="btn-gold text-[13px] px-6 py-3 flex items-center justify-center gap-2">
            📹 Join Call
          </button>
          <button className="font-body text-[12px] text-white/50 border border-white/10 rounded-lg px-5 py-3 hover:text-white/70 hover:border-white/20 transition-colors text-center">
            Add to Calendar
          </button>
        </div>
      </div>

      {/* ═══ CALL SCHEDULE ═══ */}
      <div className={`card ${device.cardPadding} mb-6`}>
        <div className="font-body font-semibold text-sm mb-3">Call Schedule</div>
        <div className="font-body text-[13px] text-white/50 leading-relaxed">
          Every <strong className="text-white/70">Thursday at 2:00 PM ET</strong> — Our weekly partner call covers product updates,
          training topics, success stories from top partners, and an open Q&A session. All partners are welcome.
          Calls typically last 45–60 minutes.
        </div>
      </div>

      {/* ═══ PAST RECORDINGS ═══ */}
      <div className="card">
        <div className="px-4 sm:px-6 py-4 border-b border-white/[0.06]">
          <div className="font-body font-semibold text-sm">Past Recordings</div>
        </div>
        {PAST_RECORDINGS.map((rec, i) => (
          <div
            key={i}
            className="px-4 sm:px-6 py-4 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors flex items-center justify-between gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="font-body text-[13px] text-white/80 truncate">{rec.title}</div>
              <div className="font-body text-[11px] text-white/30 mt-0.5">
                {rec.date} · {rec.duration}
              </div>
            </div>
            <button className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors shrink-0">
              ▶ Watch
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
