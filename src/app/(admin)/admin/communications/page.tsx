"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import EmailInboxTab from "./EmailInboxTab";
import EmailComposeTab from "./EmailComposeTab";
import EmailTemplatesTab from "./EmailTemplatesTab";
import SmsTab from "./SmsTab";
import PhoneTab from "./PhoneTab";
import WorkflowsPanel from "../workflows/WorkflowsPanel";
import TeamChatPanel from "../team-chat/TeamChatPanel";
import ChannelsListPanel from "../channels/ChannelsListPanel";

type Tab = "email" | "sms" | "phone" | "automations" | "team-chat" | "channels";
type EmailView = "inbox" | "compose" | "templates";

const TABS: { id: Tab; label: string }[] = [
  { id: "email",       label: "Email" },
  { id: "sms",         label: "SMS" },
  { id: "phone",       label: "Phone" },
  { id: "automations", label: "Automations" },
  { id: "team-chat",   label: "Team Chat" },
  { id: "channels",    label: "Channels" },
];

const EMAIL_VIEWS: { id: EmailView; label: string }[] = [
  { id: "inbox",     label: "Inbox" },
  { id: "compose",   label: "Compose" },
  { id: "templates", label: "Templates" },
];

function CommunicationsHostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const urlTab = params?.get("tab");
  const urlView = params?.get("view");

  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.id === urlTab) ? urlTab : "email") as Tab);
  const [emailView, setEmailView] = useState<EmailView>((EMAIL_VIEWS.some((v) => v.id === urlView) ? urlView : "templates") as EmailView);

  const onSelectTab = (t: Tab) => {
    setTab(t);
    const qs = new URLSearchParams();
    qs.set("tab", t);
    if (t === "email") qs.set("view", emailView);
    router.replace(`/admin/communications?${qs.toString()}`);
  };
  const onSelectEmailView = (v: EmailView) => {
    setEmailView(v);
    const qs = new URLSearchParams({ tab: "email", view: v });
    router.replace(`/admin/communications?${qs.toString()}`);
  };

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onSelectTab(t.id)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              tab === t.id ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === "email" && (
        <>
          <div className="flex gap-1 mb-6 border-b border-[var(--app-border)] overflow-x-auto">
            {EMAIL_VIEWS.map((v) => (
              <button key={v.id} onClick={() => onSelectEmailView(v.id)}
                className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  emailView === v.id ? "text-brand-gold border-brand-gold" : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
                }`}>{v.label}</button>
            ))}
          </div>
          {emailView === "inbox"     && <EmailInboxTab />}
          {emailView === "compose"   && <EmailComposeTab />}
          {emailView === "templates" && <EmailTemplatesTab />}
        </>
      )}
      {tab === "sms"         && <SmsTab />}
      {tab === "phone"       && <PhoneTab />}
      {tab === "automations" && <WorkflowsPanel />}
      {tab === "team-chat"   && <TeamChatPanel />}
      {tab === "channels"    && <ChannelsListPanel />}
    </div>
  );
}

export default function Page() {
  return <Suspense><CommunicationsHostInner /></Suspense>;
}
