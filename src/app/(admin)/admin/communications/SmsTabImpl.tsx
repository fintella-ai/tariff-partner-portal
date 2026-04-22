"use client";

import { useEffect, useState } from "react";
import SmsInboxTabImpl from "./SmsInboxTabImpl";
import SmsComposeTabImpl from "./SmsComposeTabImpl";
import SmsTemplatesTabImpl from "./SmsTemplatesTabImpl";
import SmsLogTabImpl from "./SmsLogTabImpl";

type SmsView = "overview" | "compose" | "templates" | "log";

const VIEWS: { id: SmsView; label: string }[] = [
  { id: "overview",  label: "Overview" },
  { id: "compose",   label: "Compose" },
  { id: "templates", label: "Templates" },
  { id: "log",       label: "SMS Log" },
];

/**
 * SMS section of the Communications hub. Mirrors the email section's
 * sub-tab pattern so admins have the same mental model across both
 * channels: Overview = stats + partner rosters + bulk opt-in, Compose =
 * single or bulk send form, Templates = CRUD over SmsTemplate rows,
 * SMS Log = paginated list of every outbound send + inbound reply.
 */
export default function SmsTabImpl() {
  const [view, setView] = useState<SmsView>("overview");

  // Listen for the "Use" button on SmsTemplatesTabImpl — it dispatches a
  // CustomEvent so the parent can switch sub-views without routing.
  useEffect(() => {
    const handler = () => setView("compose");
    window.addEventListener("sms:go-to-compose", handler);
    return () => window.removeEventListener("sms:go-to-compose", handler);
  }, []);

  return (
    <div>
      {/* Sub-tab bar — matches the email section's treatment */}
      <div className="flex gap-1 mb-6 border-b border-[var(--app-border)] overflow-x-auto">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
              view === v.id
                ? "text-brand-gold border-brand-gold"
                : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "overview" && <SmsInboxTabImpl />}
      {view === "compose" && <SmsComposeTabImpl />}
      {view === "templates" && <SmsTemplatesTabImpl />}
      {view === "log" && <SmsLogTabImpl />}
    </div>
  );
}
