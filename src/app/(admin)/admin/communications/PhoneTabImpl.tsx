"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";
import PartnerLink from "@/components/ui/PartnerLink";
import { useResizableColumns } from "@/components/ui/ResizableTable";

/**
 * Phone section of the Communications hub — unified call audit across all
 * partners, driven by /api/admin/calls. Shows stats + a table of inbound
 * and outbound calls with Twilio recording playback links.
 */
export default function PhoneTabImpl() {
  const { columnWidths: phoneColWidths, getResizeHandler: getPhoneResizeHandler } =
    useResizableColumns([180, 180, 160, 150, 100, 150], { storageKey: "comms-phone" });

  const [phoneCalls, setPhoneCalls] = useState<any[]>([]);
  const [phoneStats, setPhoneStats] = useState<{ total: number; completed: number; failed: number; totalSeconds: number }>({
    total: 0,
    completed: 0,
    failed: 0,
    totalSeconds: 0,
  });
  const [phoneLoading, setPhoneLoading] = useState(false);

  const loadPhone = useCallback(async () => {
    setPhoneLoading(true);
    try {
      const res = await fetch("/api/admin/calls");
      if (res.ok) {
        const data = await res.json();
        setPhoneCalls(data.calls || []);
        setPhoneStats(data.stats || { total: 0, completed: 0, failed: 0, totalSeconds: 0 });
      }
    } catch {} finally {
      setPhoneLoading(false);
    }
  }, []);
  useEffect(() => {
    loadPhone();
  }, [loadPhone]);

  const fmtDuration = (s: number | null) =>
    typeof s === "number" && s > 0
      ? `${Math.floor(s / 60)}m ${s % 60}s`
      : "—";
  const fmtTotalSeconds = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  return (
    <>
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Total Calls</div>
          <div className="font-display text-2xl font-bold">{phoneStats.total}</div>
        </div>
        <div className="card p-4">
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Completed</div>
          <div className="font-display text-2xl font-bold text-green-400">{phoneStats.completed}</div>
        </div>
        <div className="card p-4">
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Failed / No Answer</div>
          <div className="font-display text-2xl font-bold text-red-400">{phoneStats.failed}</div>
        </div>
        <div className="card p-4">
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Total Talk Time</div>
          <div className="font-display text-2xl font-bold text-brand-gold">{fmtTotalSeconds(phoneStats.totalSeconds)}</div>
        </div>
      </div>

      {/* Call log table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-center" style={{ width: phoneColWidths[0], position: "relative" }}>When<span {...getPhoneResizeHandler(0)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: phoneColWidths[1], position: "relative" }}>Partner<span {...getPhoneResizeHandler(1)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: phoneColWidths[2], position: "relative" }}>Number<span {...getPhoneResizeHandler(2)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: phoneColWidths[3], position: "relative" }}>Initiated By<span {...getPhoneResizeHandler(3)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: phoneColWidths[4], position: "relative" }}>Duration<span {...getPhoneResizeHandler(4)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: phoneColWidths[5], position: "relative" }}>Status<span {...getPhoneResizeHandler(5)} /></th>
            </tr>
          </thead>
          <tbody>
            {phoneCalls.map((c: any) => {
              const statusBadge =
                c.status === "completed"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : c.status === "in-progress" || c.status === "ringing" || c.status === "initiated"
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : c.status === "failed" || c.status === "no-answer" || c.status === "busy" || c.status === "canceled"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]";
              return (
                <tr key={c.id} className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition">
                  <td className="px-4 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">{fmtDateTime(c.createdAt)}</td>
                  <td className="px-4 py-3">
                    {c.partnerId ? (
                      <PartnerLink partnerId={c.partnerId} className="text-[var(--app-text)] font-medium">
                        {c.partnerName || "—"}
                      </PartnerLink>
                    ) : (
                      <span className="text-[var(--app-text-muted)]">Unknown</span>
                    )}
                    {c.partnerCompany && (
                      <div className="text-[11px] text-[var(--app-text-muted)]">{c.partnerCompany}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[var(--app-text-secondary)]">{c.toPhone || "—"}</td>
                  <td className="px-4 py-3 text-[12px] text-[var(--app-text-muted)]">
                    {c.initiatedByName || c.initiatedByEmail || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]">{fmtDuration(c.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge}`}>
                      {c.status || "—"}
                    </span>
                    {c.recordingUrl && (
                      <a
                        href={`/api/twilio/recording?url=${encodeURIComponent(c.recordingUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 font-body text-[11px] text-brand-gold hover:underline"
                      >
                        ▶ Recording
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {phoneCalls.length === 0 && (
          <p className="text-center text-[var(--app-text-muted)] font-body text-sm py-8">
            {phoneLoading
              ? "Loading calls..."
              : "No phone calls yet. Click Call Partner on any profile or use the softphone dialer to place a call."}
          </p>
        )}
      </div>
    </>
  );
}
