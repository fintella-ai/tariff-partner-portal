"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Email = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  preview: string;
  date: string;
  read: boolean;
  replied: boolean;
};

type Template = {
  id: string;
  name: string;
  category: string;
  subject: string;
  preview: string;
};

type Automation = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
};

type SmsPartner = {
  id: string;
  name: string;
  phone: string;
  optInDate: string;
  messagesSent: number;
};

/* ------------------------------------------------------------------ */
/*  Demo data                                                          */
/* ------------------------------------------------------------------ */

const demoEmails: Email[] = [
  {
    id: "EM-001",
    fromName: "Sarah Chen",
    fromEmail: "sarah.chen@summitlegal.com",
    subject: "Question about commission timing",
    preview:
      "Hi, I wanted to ask about the expected timeline for my March commissions. The dashboard shows pending but I was hoping to get clarity on when...",
    date: "2026-03-24",
    read: false,
    replied: false,
  },
  {
    id: "EM-002",
    fromName: "Mike Torres",
    fromEmail: "mike.torres@apextrade.com",
    subject: "RE: W9 Form Submission",
    preview:
      "Thanks for confirming — I just uploaded the corrected W9. Let me know if there are any other documents you need from us.",
    date: "2026-03-23",
    read: true,
    replied: true,
  },
  {
    id: "EM-003",
    fromName: "Lisa Park",
    fromEmail: "lisa.park@pinnaclegroup.com",
    subject: "New partner referral question",
    preview:
      "I have a colleague who is interested in joining the partner program. What is the best way for them to apply? Is there a direct link I can share?",
    date: "2026-03-22",
    read: false,
    replied: false,
  },
  {
    id: "EM-004",
    fromName: "John Orlando",
    fromEmail: "j.orlando@redstonellc.com",
    subject: "Deal update — Acme Electronics",
    preview:
      "Wanted to let you know that Acme Electronics signed the engagement letter today. Please update the deal stage when you get a chance.",
    date: "2026-03-21",
    read: true,
    replied: true,
  },
  {
    id: "EM-005",
    fromName: "David Kim",
    fromEmail: "david.kim@libertytariff.com",
    subject: "Banking info update request",
    preview:
      "Our company recently switched banks. Could you walk me through the process to update our direct deposit information for future commissions?",
    date: "2026-03-20",
    read: true,
    replied: false,
  },
];

const demoTemplates: Template[] = [
  {
    id: "TPL-001",
    name: "Welcome New Partner",
    category: "Onboarding",
    subject: "Welcome to TRLN Partner Program!",
    preview:
      "Thank you for joining the TRLN Partner Program. We are excited to have you on board and look forward to a successful partnership...",
  },
  {
    id: "TPL-002",
    name: "Deal Status Update",
    category: "Deal Updates",
    subject: "Update on Your Referred Client",
    preview:
      "We wanted to provide you with an update on the status of your referred client. Here is the latest information regarding the deal progress...",
  },
  {
    id: "TPL-003",
    name: "Commission Payment Notification",
    category: "Commissions",
    subject: "Your Commission Has Been Processed",
    preview:
      "Great news! Your commission payment has been processed and should arrive in your account within 2-3 business days...",
  },
  {
    id: "TPL-004",
    name: "Monthly Partner Newsletter",
    category: "Company Updates",
    subject: "TRLN Monthly Update — {month}",
    preview:
      "Here is your monthly update from TRLN. This month we have some exciting news including new features, upcoming events, and program updates...",
  },
];

const demoAutomations: Automation[] = [
  {
    id: "AUTO-001",
    name: "New Partner Welcome",
    trigger: "Partner signs up",
    action: "Send: Welcome email template",
    enabled: true,
  },
  {
    id: "AUTO-002",
    name: "Deal Stage Change",
    trigger: "Deal moves to new stage",
    action: "Send: Deal update email",
    enabled: true,
  },
  {
    id: "AUTO-003",
    name: "Commission Paid",
    trigger: "Commission marked as paid",
    action: "Send: Payment notification",
    enabled: true,
  },
  {
    id: "AUTO-004",
    name: "Monthly Newsletter",
    trigger: "1st of each month",
    action: "Send: Monthly newsletter",
    enabled: false,
  },
];

const demoSmsPartners: SmsPartner[] = [
  {
    id: "SMS-001",
    name: "Sarah Chen",
    phone: "(4**) ***-**47",
    optInDate: "2026-01-15",
    messagesSent: 12,
  },
  {
    id: "SMS-002",
    name: "Mike Torres",
    phone: "(3**) ***-**19",
    optInDate: "2026-02-03",
    messagesSent: 8,
  },
  {
    id: "SMS-003",
    name: "Lisa Park",
    phone: "(7**) ***-**82",
    optInDate: "2026-02-20",
    messagesSent: 5,
  },
];

const categoryOptions = [
  "Onboarding",
  "Deal Updates",
  "Commissions",
  "Company Updates",
  "Promotions",
];

const categoryBadge: Record<string, string> = {
  Onboarding: "bg-blue-500/20 text-blue-400",
  "Deal Updates": "bg-purple-500/20 text-purple-400",
  Commissions: "bg-green-500/20 text-green-400",
  "Company Updates": "bg-orange-500/20 text-orange-400",
  Promotions: "bg-pink-500/20 text-pink-400",
};

/* ------------------------------------------------------------------ */
/*  Main tabs                                                          */
/* ------------------------------------------------------------------ */

const mainTabs = ["Inbox", "Compose", "Templates", "Automations", "SMS"] as const;
type MainTab = (typeof mainTabs)[number];

const inboxFilters = ["All", "Unread", "Replied"] as const;
type InboxFilter = (typeof inboxFilters)[number];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("Inbox");

  /* Inbox state */
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("All");

  /* Compose state */
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [alsoSms, setAlsoSms] = useState(false);

  /* Templates state */
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplCategory, setNewTplCategory] = useState(categoryOptions[0]);
  const [newTplSubject, setNewTplSubject] = useState("");
  const [newTplBody, setNewTplBody] = useState("");

  /* Automations state */
  const [automations, setAutomations] = useState(demoAutomations);

  /* SMS state */
  const [smsTo, setSmsTo] = useState("");
  const [smsMessage, setSmsMessage] = useState("");

  /* ---- Filtered inbox ---- */
  const filteredEmails = demoEmails.filter((e) => {
    if (inboxFilter === "All") return true;
    if (inboxFilter === "Unread") return !e.read;
    if (inboxFilter === "Replied") return e.replied;
    return true;
  });

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  function renderInbox() {
    return (
      <>
        {/* Inbox filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {inboxFilters.map((f) => (
            <button
              key={f}
              onClick={() => setInboxFilter(f)}
              className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
                inboxFilter === f
                  ? "bg-brand-gold/20 text-brand-gold"
                  : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block card overflow-x-auto">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Sender</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmails.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition ${
                    !e.read ? "border-l-2 border-l-brand-gold" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className={`font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                      {e.fromName}
                    </div>
                    <div className="text-xs text-[var(--app-text-muted)]">{e.fromEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                      {e.subject}
                    </div>
                    <div className="text-xs text-[var(--app-text-muted)] truncate max-w-[320px]">
                      {e.preview}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                    {fmtDate(e.date)}
                  </td>
                  <td className="px-4 py-3">
                    {!e.read && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold mr-1">
                        Unread
                      </span>
                    )}
                    {e.replied && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        Replied
                      </span>
                    )}
                    {e.read && !e.replied && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-[var(--app-input-bg)] text-[var(--app-text-muted)]">
                        Read
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition mr-1">
                      Reply
                    </button>
                    <button className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredEmails.length === 0 && (
            <p className="text-center text-[var(--app-text-muted)] font-body text-sm py-8">
              No emails match this filter.
            </p>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {filteredEmails.map((e) => (
            <div
              key={e.id}
              className={`card p-4 ${!e.read ? "border-l-2 border-l-brand-gold" : ""}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className={`font-body text-sm font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                    {e.fromName}
                  </div>
                  <div className="font-body text-xs text-[var(--app-text-muted)]">{e.fromEmail}</div>
                </div>
                <span className="font-body text-xs text-[var(--app-text-muted)] whitespace-nowrap">
                  {fmtDate(e.date)}
                </span>
              </div>
              <div className={`font-body text-sm font-medium mb-1 ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                {e.subject}
              </div>
              <p className="font-body text-xs text-[var(--app-text-muted)] line-clamp-2 mb-3">
                {e.preview}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {!e.read && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-gold/20 text-brand-gold">
                      Unread
                    </span>
                  )}
                  {e.replied && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                      Replied
                    </span>
                  )}
                  {e.read && !e.replied && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--app-input-bg)] text-[var(--app-text-muted)]">
                      Read
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition">
                    Reply
                  </button>
                  <button className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition">
                    View
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredEmails.length === 0 && (
            <p className="text-center text-[var(--app-text-muted)] font-body text-sm py-8">
              No emails match this filter.
            </p>
          )}
        </div>
      </>
    );
  }

  function renderCompose() {
    return (
      <div className="card p-6">
        <h3 className="font-display text-lg font-bold mb-4">New Email</h3>

        <div className="flex flex-col gap-4 font-body text-sm">
          {/* To */}
          <div>
            <label className="block text-[var(--app-text-muted)] text-xs mb-1">To</label>
            <input
              type="text"
              placeholder="Type partner name or email..."
              value={composeTo}
              onChange={(e) => setComposeTo(e.target.value)}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
            />
          </div>

          {/* CC / BCC toggle */}
          <button
            onClick={() => setShowCcBcc(!showCcBcc)}
            className="text-xs text-brand-gold hover:text-brand-gold/80 transition self-start"
          >
            {showCcBcc ? "Hide CC/BCC" : "Show CC/BCC"}
          </button>

          {showCcBcc && (
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">CC</label>
                <input
                  type="text"
                  placeholder="CC recipients..."
                  value={composeCc}
                  onChange={(e) => setComposeCc(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">BCC</label>
                <input
                  type="text"
                  placeholder="BCC recipients..."
                  value={composeBcc}
                  onChange={(e) => setComposeBcc(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-[var(--app-text-muted)] text-xs mb-1">Subject</label>
            <input
              type="text"
              placeholder="Email subject..."
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-[var(--app-text-muted)] text-xs mb-1">Body</label>
            <textarea
              placeholder="Write your message..."
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              className="w-full min-h-[250px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-[var(--app-text-muted)] text-xs mb-1">Attachments</label>
            <div className="w-full border-2 border-dashed border-[var(--app-border)] rounded-lg px-4 py-6 text-center text-[var(--app-text-muted)] hover:border-brand-gold/30 transition cursor-pointer">
              <svg
                className="mx-auto mb-2 w-8 h-8 text-[var(--app-text-faint)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
                />
              </svg>
              <span className="text-xs">Click or drag files here to attach</span>
            </div>
          </div>

          {/* SMS checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoSms}
              onChange={(e) => setAlsoSms(e.target.checked)}
              className="accent-brand-gold w-4 h-4"
            />
            <span className="text-[var(--app-text-secondary)] text-xs">
              Also send SMS notification (if partner opted in)
            </span>
          </label>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button className="px-6 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition">
              Send Email
            </button>
            <button className="px-6 py-2 rounded font-medium bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] border border-[var(--app-border)] transition">
              Save as Draft
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderTemplates() {
    return (
      <>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display text-lg font-bold">Email Templates</h3>
          <button
            onClick={() => setShowNewTemplate(!showNewTemplate)}
            className="text-sm px-4 py-1.5 rounded bg-brand-gold text-black font-medium hover:bg-brand-gold/90 transition"
          >
            {showNewTemplate ? "Cancel" : "Create Template"}
          </button>
        </div>

        {/* New template form */}
        {showNewTemplate && (
          <div className="card p-5 mb-6">
            <h4 className="font-display text-sm font-bold mb-4">New Template</h4>
            <div className="flex flex-col gap-4 font-body text-sm">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Template Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Follow-up Reminder"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                  />
                </div>
                <div className="sm:w-48">
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Category</label>
                  <select
                    value={newTplCategory}
                    onChange={(e) => setNewTplCategory(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] focus:outline-none focus:border-brand-gold/50"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c} className="bg-[#1a1a2e] text-[var(--app-text)]">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Subject Line</label>
                <input
                  type="text"
                  placeholder="Email subject..."
                  value={newTplSubject}
                  onChange={(e) => setNewTplSubject(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Body</label>
                <textarea
                  placeholder="Template body..."
                  value={newTplBody}
                  onChange={(e) => setNewTplBody(e.target.value)}
                  className="w-full min-h-[150px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
                />
              </div>
              <button className="self-start px-5 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition">
                Save Template
              </button>
            </div>
          </div>
        )}

        {/* Template cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {demoTemplates.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-display text-sm font-bold">{t.name}</h4>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    categoryBadge[t.category] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                  }`}
                >
                  {t.category}
                </span>
              </div>
              <p className="font-body text-xs text-[var(--app-text-muted)] mb-1">
                <span className="text-[var(--app-text-secondary)]">Subject:</span> {t.subject}
              </p>
              <p className="font-body text-xs text-[var(--app-text-muted)] line-clamp-2 mb-4">
                {t.preview}
              </p>
              <div className="flex gap-2">
                <button className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition">
                  Use
                </button>
                <button className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition">
                  Edit
                </button>
                <button className="text-xs px-3 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderAutomations() {
    return (
      <>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-display text-lg font-bold">Email &amp; SMS Automations</h3>
            <p className="font-body text-xs text-[var(--app-text-muted)] mt-1">
              Configure automated messages triggered by system events.
            </p>
          </div>
          <button className="text-sm px-4 py-1.5 rounded bg-brand-gold text-black font-medium hover:bg-brand-gold/90 transition">
            Create Automation
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {automations.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-display text-sm font-bold mb-1">{a.name}</h4>
                  <p className="font-body text-xs text-[var(--app-text-muted)]">
                    <span className="text-[var(--app-text-secondary)]">Trigger:</span> {a.trigger}
                  </p>
                  <p className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">
                    <span className="text-[var(--app-text-secondary)]">Action:</span> {a.action}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {/* Toggle switch */}
                  <button
                    onClick={() =>
                      setAutomations((prev) =>
                        prev.map((item) =>
                          item.id === a.id ? { ...item, enabled: !item.enabled } : item
                        )
                      )
                    }
                    className="flex items-center gap-2"
                  >
                    <div
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        a.enabled ? "bg-green-500" : "bg-[var(--app-input-bg)]"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          a.enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </div>
                    <span
                      className={`font-body text-xs font-medium ${
                        a.enabled ? "text-green-400" : "text-[var(--app-text-muted)]"
                      }`}
                    >
                      {a.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </button>
                  <button className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition">
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderSms() {
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
          <table className="w-full text-left font-body text-sm hidden sm:table">
            <thead>
              <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Opt-In Date</th>
                <th className="px-4 py-3">Messages Sent</th>
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
                    {p.phone}
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
                  <span className="font-mono text-xs text-[var(--app-text-muted)]">{p.phone}</span>
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

  /* ---------------------------------------------------------------- */
  /*  Main render                                                      */
  /* ---------------------------------------------------------------- */

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        Communications Hub
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Manage partner emails, templates, automations, and SMS notifications.
      </p>

      {/* Main tab navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {mainTabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              activeTab === t
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Inbox" && renderInbox()}
      {activeTab === "Compose" && renderCompose()}
      {activeTab === "Templates" && renderTemplates()}
      {activeTab === "Automations" && renderAutomations()}
      {activeTab === "SMS" && renderSms()}
    </div>
  );
}
