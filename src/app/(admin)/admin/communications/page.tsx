"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import EmailInboxTabImpl from "./EmailInboxTabImpl";
import EmailComposeTabImpl from "./EmailComposeTabImpl";
import GmailTabImpl from "./GmailTabImpl";
import SmsTabImpl from "./SmsTabImpl";
import PhoneTabImpl from "./PhoneTabImpl";
import TeamChatPanel from "../team-chat/TeamChatPanel";
import ChannelsListPanel from "../channels/ChannelsListPanel";

type Tab = "email" | "sms" | "phone" | "team-chat" | "channels";
type EmailView = "inbox" | "gmail" | "compose";

// Email Templates moved to Admin → Automations → Email Templates. The
// Communications hub stays focused on partner-facing channels (inbox,
// compose, SMS, phone, team chat, channels).
const ALL_TABS: { id: Tab; label: string; superAdminOnly?: boolean }[] = [
  { id: "email",     label: "Email" },
  { id: "sms",       label: "SMS" },
  { id: "phone",     label: "Phone" },
  { id: "team-chat", label: "Team Chat" },
  { id: "channels",  label: "Channels" },
];

const EMAIL_VIEWS: { id: EmailView; label: string }[] = [
  { id: "inbox",     label: "Inbox" },
  { id: "gmail",     label: "Gmail" },
  { id: "compose",   label: "Compose" },
];

/**
 * Communications hub host page. Owns the single header + the top-level
 * pill bar. Each section below is a focused `*Impl` component that owns
 * its own state. The hub replaces the old 1700-line `EmailTemplatesTab`
 * bundle which had its own pill bar + h2 and caused duplicate UI when
 * mounted inside this host.
 */
function CommunicationsHostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";
  const urlTab = params?.get("tab");
  const urlView = params?.get("view");

  const TABS = ALL_TABS.filter((t) => !t.superAdminOnly || isSuperAdmin);

  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.id === urlTab) ? urlTab : "email") as Tab);
  const [emailView, setEmailView] = useState<EmailView>((EMAIL_VIEWS.some((v) => v.id === urlView) ? urlView : "inbox") as EmailView);

  const pushUrl = (qs: URLSearchParams) => {
    router.replace(`/admin/communications?${qs.toString()}`);
  };
  const onSelectTab = (t: Tab) => {
    setTab(t);
    const qs = new URLSearchParams();
    qs.set("tab", t);
    if (t === "email") qs.set("view", emailView);
    pushUrl(qs);
  };
  const onSelectEmailView = (v: EmailView) => {
    setEmailView(v);
    const qs = new URLSearchParams({ tab: "email", view: v });
    pushUrl(qs);
  };

  return (
    <div>
      {/* Single hub header — no section component repeats this. */}
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        Communications Hub
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Manage partner email, SMS, phone, and internal team chat from one place.
      </p>

      {/* Top-level pill bar */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onSelectTab(t.id)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              tab === t.id ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Email — secondary sub-tab bar (Inbox / Compose / Templates) */}
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
          {emailView === "inbox"     && <EmailInboxTabImpl />}
          {emailView === "gmail"     && <GmailTabImpl />}
          {emailView === "compose"   && <EmailComposeTabImpl />}
        </>
      )}

      {tab === "sms"         && <SmsTabImpl />}
      {tab === "phone"       && <PhoneTabImpl />}
      {tab === "team-chat"   && <TeamChatPanel />}
      {tab === "channels"    && <ChannelsListPanel />}
    </div>
  );
}

export default function Page() {
  return <Suspense><CommunicationsHostInner /></Suspense>;
}
