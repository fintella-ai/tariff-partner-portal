"use client";

import { useState } from "react";
import { fmtDate, fmtPhone } from "@/lib/format";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import { demoSmsPartners } from "./_shared";

/**
 * SMS section of the Communications hub. Currently demo-seeded — the
 * opted-in partners list + compose form are UI only until the A2P 10DLC
 * approval lands (see CLAUDE.md integration table).
 */
export default function SmsTabImpl() {
  const { columnWidths: smsColWidths, getResizeHandler: getSmsResizeHandler } =
    useResizableColumns([200, 180, 150, 120], { storageKey: "comms-sms" });

  const [smsTo, setSmsTo] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const smsCharCount = smsMessage.length;

  return (
    <>
      <h3 className="font-display text-lg font-bold mb-1">SMS Notifications</h3>
      <p className="font-body text-xs text-[var(--app-text-muted)] mb-6">
        Manage SMS messaging for opted-in partners.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Partners Opted In", value: "18" },
          { label: "Messages Sent This Month", value: "42" },
          { label: "Delivery Rate", value: "98%" },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">{s.label}</div>
            <div className="font-display text-xl font-bold text-brand-gold">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Opted-in partners */}
      <div className="card overflow-x-auto mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)]">
          <h4 className="font-display text-sm font-bold">Opted-In Partners</h4>
          <button className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition">
            Send Bulk SMS
          </button>
        </div>

        {/* Desktop table */}
        <table className="w-full text-left font-body text-sm hidden sm:table" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-center" style={{ width: smsColWidths[0], position: "relative" }}>Partner<span {...getSmsResizeHandler(0)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: smsColWidths[1], position: "relative" }}>Phone<span {...getSmsResizeHandler(1)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: smsColWidths[2], position: "relative" }}>Opt-In Date<span {...getSmsResizeHandler(2)} /></th>
              <th className="px-4 py-3 text-center" style={{ width: smsColWidths[3], position: "relative" }}>Messages Sent<span {...getSmsResizeHandler(3)} /></th>
            </tr>
          </thead>
          <tbody>
            {demoSmsPartners.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition"
              >
                <td className="px-4 py-3 text-[var(--app-text)]">{p.name}</td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)] font-mono text-xs">
                  {fmtPhone(p.phone)}
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">{fmtDate(p.optInDate)}</td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">{p.messagesSent}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="sm:hidden flex flex-col">
          {demoSmsPartners.map((p) => (
            <div key={p.id} className="px-4 py-3 border-b border-[var(--app-border-subtle)]">
              <div className="flex items-center justify-between mb-1">
                <span className="font-body text-sm text-[var(--app-text)]">{p.name}</span>
                <span className="font-mono text-xs text-[var(--app-text-muted)]">{fmtPhone(p.phone)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-xs text-[var(--app-text-muted)]">
                  Opted in {fmtDate(p.optInDate)}
                </span>
                <span className="font-body text-xs text-[var(--app-text-muted)]">
                  {p.messagesSent} messages
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compose SMS */}
      <div className="card p-5 mb-4">
        <h4 className="font-display text-sm font-bold mb-4">Compose SMS</h4>
        <div className="flex flex-col gap-4 font-body text-sm">
          <div>
            <label className="block text-[var(--app-text-muted)] text-xs mb-1">To</label>
            <input
              type="text"
              placeholder="Select a partner..."
              value={smsTo}
              onChange={(e) => setSmsTo(e.target.value)}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[var(--app-text-muted)] text-xs">Message</label>
              <span
                className={`text-xs ${
                  smsCharCount > 160 ? "text-red-400" : "text-[var(--app-text-muted)]"
                }`}
              >
                {smsCharCount}/160
              </span>
            </div>
            <textarea
              placeholder="Type your SMS message..."
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              maxLength={160}
              className="w-full min-h-[80px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
            />
          </div>
          <button className="self-start px-5 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition">
            Send SMS
          </button>
        </div>
      </div>

      <p className="font-body text-xs text-[var(--app-text-muted)] italic">
        Partners must opt in to receive SMS notifications. Manage opt-in preferences in
        partner settings.
      </p>
    </>
  );
}
