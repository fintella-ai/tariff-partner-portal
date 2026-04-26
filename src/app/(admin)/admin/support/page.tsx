"use client";
import { Suspense, useState, lazy } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SupportTicketsPanel from "./SupportTicketsPanel";
import LiveChatPanel from "../chat/LiveChatPanel";
import AdminPresenceBar from "@/components/admin/AdminPresenceBar";

const FeatureRequestsPanel = lazy(() => import("../features/page"));
const KnowledgeGapsPanel = lazy(() => import("../knowledge-gaps/page"));

type Tab = "tickets" | "livechat" | "features" | "knowledge-gaps";
const TABS: { id: Tab; label: string }[] = [
  { id: "tickets",  label: "Support Tickets" },
  { id: "livechat", label: "Live Chat" },
  { id: "features", label: "Feature Requests" },
  { id: "knowledge-gaps", label: "Knowledge Gaps" },
];

function SupportHostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const urlTab = params?.get("tab");
  const initial: Tab = (TABS.some((t) => t.id === urlTab) ? (urlTab as Tab) : "tickets");
  const [tab, setTab] = useState<Tab>(initial);

  const onSelect = (t: Tab) => {
    setTab(t);
    const qs = new URLSearchParams(params?.toString() || "");
    qs.set("tab", t);
    router.replace(`/admin/support?${qs.toString()}`);
  };

  return (
    <div>
      {/* Team presence — who else is available for support */}
      <div className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)]">
        <AdminPresenceBar />
      </div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onSelect(t.id)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              tab === t.id ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}>{t.label}</button>
        ))}
      </div>
      {tab === "tickets"  && <SupportTicketsPanel />}
      {tab === "livechat" && <LiveChatPanel />}
      {tab === "features" && <Suspense fallback={<div className="spinner mx-auto mt-8" />}><FeatureRequestsPanel /></Suspense>}
      {tab === "knowledge-gaps" && <Suspense fallback={<div className="spinner mx-auto mt-8" />}><KnowledgeGapsPanel /></Suspense>}
    </div>
  );
}

export default function Page() {
  return <Suspense><SupportHostInner /></Suspense>;
}
