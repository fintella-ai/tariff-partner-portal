"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import WorkflowsPanel from "../workflows/WorkflowsPanel";
import EmailTemplatesTabImpl from "../communications/EmailTemplatesTabImpl";
import HardcodedTriggersDoc from "./HardcodedTriggersDoc";

type TabId = "workflows" | "hardcoded" | "templates";

const TABS: { id: TabId; label: string; help: string }[] = [
  { id: "workflows", label: "Workflows", help: "Admin-editable automations driven by in-app event triggers." },
  { id: "hardcoded", label: "Hardcoded Triggers", help: "Reference: every event site in the codebase that fires an email directly, without going through the workflow engine." },
  { id: "templates", label: "Email Templates", help: "The copy + layout used by every outbound email. Editable per template; applies to both workflow-driven and hardcoded sends." },
];

export default function AutomationsPage() {
  return (
    <Suspense fallback={<div />}>
      <AutomationsInner />
    </Suspense>
  );
}

function AutomationsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = (searchParams.get("tab") as TabId) || "workflows";
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initial) ? initial : "workflows");

  useEffect(() => {
    const next = (searchParams.get("tab") as TabId) || "workflows";
    if (TABS.some((t) => t.id === next) && next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchTab = (id: TabId) => {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    router.replace(url.pathname + url.search);
  };

  const active = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--app-text)]">Automations</h1>
        <p className="font-body text-[13px] text-[var(--app-text-secondary)] mt-1 leading-relaxed max-w-3xl">
          Event-driven sends, templates, and the reference list of hardcoded trigger points across the portal.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--app-border)] mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={`font-body text-[12px] tracking-[1px] uppercase px-4 py-3 border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.id
                ? "border-brand-gold text-brand-gold"
                : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-6 leading-relaxed">
        {active.help}
      </p>

      {tab === "workflows" && <WorkflowsPanel />}
      {tab === "hardcoded" && <HardcodedTriggersDoc />}
      {tab === "templates" && <EmailTemplatesTabImpl />}
    </div>
  );
}
