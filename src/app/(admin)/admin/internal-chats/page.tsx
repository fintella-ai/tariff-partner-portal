"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import TeamChatPanel from "../team-chat/TeamChatPanel";
import ChannelsListPanel from "../channels/ChannelsListPanel";
import DmFlagsListPanel from "../partner-dm-flags/DmFlagsListPanel";
import AdminDmPanel from "./AdminDmPanel";

type Tab = "team-chat" | "partner-dm" | "channels" | "dmflags";
const TABS: { id: Tab; label: string }[] = [
  { id: "team-chat", label: "Team Chat" },
  { id: "partner-dm", label: "Partner DM" },
  { id: "channels",  label: "Channels" },
  { id: "dmflags",   label: "DM Flags" },
];

function InternalChatsHostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const urlTab = params?.get("tab");
  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.id === urlTab) ? urlTab : "team-chat") as Tab);

  const onSelect = (t: Tab) => {
    setTab(t);
    const qs = new URLSearchParams(params?.toString() || "");
    qs.set("tab", t);
    router.replace(`/admin/internal-chats?${qs.toString()}`);
  };

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onSelect(t.id)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              tab === t.id ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}>{t.label}</button>
        ))}
      </div>
      {tab === "team-chat" && <TeamChatPanel />}
      {tab === "partner-dm" && <AdminDmPanel />}
      {tab === "channels"  && <ChannelsListPanel />}
      {tab === "dmflags"   && <DmFlagsListPanel />}
    </div>
  );
}

export default function Page() {
  return <Suspense><InternalChatsHostInner /></Suspense>;
}
