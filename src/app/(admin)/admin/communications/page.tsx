"use client";

import { useState, useEffect, useCallback } from "react";
import { fmtDate, fmtDateTime, fmtPhone } from "@/lib/format";
import PartnerLink from "@/components/ui/PartnerLink";
import { useResizableColumns } from "@/components/ui/ResizableTable";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Email = {
  id: string;
  fromName: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  partnerCode: string | null;
  supportTicketId: string | null;
  read: boolean;
  replied: boolean;
  createdAt: string;
};

// EmailTemplate row shape (matches the Prisma model + the API response from
// /api/admin/email-templates). The wired transactional templates (welcome,
// agreement_ready, agreement_signed, signup_notification) drive real partner
// emails via src/lib/sendgrid.ts; drafts are placeholders for future
// automation work.
type Template = {
  id: string;
  key: string;
  name: string;
  category: string;
  subject: string;
  preheader: string | null;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  enabled: boolean;
  isDraft: boolean;
  description: string | null;
  variables: string | null; // JSON-stringified array of variable names
  createdAt: string;
  updatedAt: string;
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

// Inbox data is fetched live from /api/admin/inbox. See loadInbox() below.

// (Templates are now fetched live from /api/admin/email-templates — see the
// `templates` state + `loadTemplates()` effect in the component below. The
// 7 templates that ship with a fresh DB are seeded by scripts/seed-all.js.)

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

const mainTabs = ["Inbox", "Compose", "Templates", "Automations", "SMS", "Phone"] as const;
type MainTab = (typeof mainTabs)[number];

const inboxFilters = ["All", "Unread", "Replied"] as const;
type InboxFilter = (typeof inboxFilters)[number];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<MainTab>("Inbox");
  const [partnerIdMap, setPartnerIdMap] = useState<Record<string, string>>({});

  // Resizable column hooks
  const { columnWidths: inboxColWidths, getResizeHandler: getInboxResizeHandler } = useResizableColumns([250, 300, 150, 100, 100]);
  const { columnWidths: smsColWidths, getResizeHandler: getSmsResizeHandler } = useResizableColumns([200, 180, 150, 120]);
  const { columnWidths: phoneColWidths, getResizeHandler: getPhoneResizeHandler } = useResizableColumns([180, 180, 160, 150, 100, 150]);

  // Fetch partner name→id map for clickable links
  useEffect(() => {
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, string> = {};
        for (const p of data.partners || []) {
          map[`${p.firstName} ${p.lastName}`] = p.id;
        }
        setPartnerIdMap(map);
      })
      .catch(() => {});
  }, []);

  /* Inbox state — real inbound emails from SendGrid Inbound Parse */
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("All");
  const [inboxEmails, setInboxEmails] = useState<Email[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const res = await fetch(`/api/admin/inbox?filter=${inboxFilter.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        setInboxEmails(data.emails || []);
      }
    } catch {} finally {
      setInboxLoading(false);
    }
  }, [inboxFilter]);

  useEffect(() => {
    if (activeTab === "Inbox") loadInbox();
  }, [activeTab, loadInbox]);

  const openEmail = async (e: Email) => {
    setSelectedEmail(e);
    setReplyBody("");
    setReplyError(null);
    if (!e.read) {
      await fetch("/api/admin/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.id, read: true }),
      }).catch(() => {});
      setInboxEmails((prev) => prev.map((x) => (x.id === e.id ? { ...x, read: true } : x)));
    }
  };

  const sendReply = async () => {
    if (!selectedEmail || !replyBody.trim()) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/admin/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboundEmailId: selectedEmail.id, body: replyBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplyError(data.error || "Failed to send");
        return;
      }
      setInboxEmails((prev) =>
        prev.map((x) => (x.id === selectedEmail.id ? { ...x, replied: true, read: true } : x))
      );
      setSelectedEmail(null);
      setReplyBody("");
    } catch (err: any) {
      setReplyError(err?.message || "Failed to send");
    } finally {
      setReplySending(false);
    }
  };

  /* Compose state */
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [alsoSms, setAlsoSms] = useState(false);

  /* Templates state */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTplKey, setNewTplKey] = useState("");
  const [newTplName, setNewTplName] = useState("");
  const [newTplCategory, setNewTplCategory] = useState(categoryOptions[0]);
  const [newTplSubject, setNewTplSubject] = useState("");
  const [newTplBody, setNewTplBody] = useState("");
  const [newTplSaving, setNewTplSaving] = useState(false);

  // Templates sub-tab — splits live (wired) from drafts (placeholders) so
  // super admins can see at a glance which templates are actually firing.
  const [templatesSubTab, setTemplatesSubTab] = useState<"live" | "drafts">("live");

  // Edit modal state — null means modal closed
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Fetch templates whenever the Templates tab opens (or after a save / delete).
  // useCallback so the same reference can be reused by handlers below.
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await fetch("/api/admin/email-templates");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      setTemplatesError(err?.message || "Failed to load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "Templates" && templates.length === 0 && !templatesLoading) {
      loadTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Template handlers ──
  const handleCreateTemplate = async () => {
    if (!newTplKey.trim() || !newTplName.trim() || !newTplSubject.trim() || !newTplBody.trim()) {
      alert("Key, name, subject, and body are all required.");
      return;
    }
    setNewTplSaving(true);
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newTplKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
          name: newTplName.trim(),
          category: newTplCategory,
          subject: newTplSubject.trim(),
          heading: newTplName.trim(),
          bodyHtml: `<p>${newTplBody.trim().replace(/\n/g, "</p><p>")}</p>`,
          bodyText: newTplBody.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to create template");
        return;
      }
      // Reset form + refresh
      setNewTplKey("");
      setNewTplName("");
      setNewTplCategory(categoryOptions[0]);
      setNewTplSubject("");
      setNewTplBody("");
      setShowNewTemplate(false);
      await loadTemplates();
    } finally {
      setNewTplSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTpl) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/email-templates/${editingTpl.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingTpl.name,
          category: editingTpl.category,
          subject: editingTpl.subject,
          preheader: editingTpl.preheader,
          heading: editingTpl.heading,
          bodyHtml: editingTpl.bodyHtml,
          bodyText: editingTpl.bodyText,
          ctaLabel: editingTpl.ctaLabel,
          ctaUrl: editingTpl.ctaUrl,
          fromEmail: editingTpl.fromEmail,
          fromName: editingTpl.fromName,
          replyTo: editingTpl.replyTo,
          description: editingTpl.description,
          enabled: editingTpl.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || `HTTP ${res.status}`);
        return;
      }
      setEditingTpl(null);
      await loadTemplates();
    } catch (err: any) {
      setEditError(err?.message || "Network error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteTemplate = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/email-templates/${t.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || `HTTP ${res.status}`);
        return;
      }
      await loadTemplates();
    } catch (err: any) {
      alert(err?.message || "Network error");
    }
  };

  // "Use" button — switch to the Compose tab and pre-fill subject + body
  // with the template's content (un-interpolated, so the admin can manually
  // tweak before sending). Variable placeholders like {firstName} stay as-is
  // for the admin to replace.
  const handleUseTemplate = (t: Template) => {
    setComposeSubject(t.subject);
    setComposeBody(t.bodyText);
    setActiveTab("Compose");
  };

  /* Automations state */
  const [automations, setAutomations] = useState(demoAutomations);

  /* SMS state */
  const [smsTo, setSmsTo] = useState("");
  const [smsMessage, setSmsMessage] = useState("");

  /* Phone (unified call audit) state */
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
    if (activeTab === "Phone") loadPhone();
  }, [activeTab, loadPhone]);

  /* ---- Filtered inbox (server-side filter is primary, this is a fallback) ---- */
  const filteredEmails = inboxEmails.filter((e) => {
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
          <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[0], position: "relative" }}>Sender<span {...getInboxResizeHandler(0)} /></th>
                <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[1], position: "relative" }}>Subject<span {...getInboxResizeHandler(1)} /></th>
                <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[2], position: "relative" }}>Date<span {...getInboxResizeHandler(2)} /></th>
                <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[3], position: "relative" }}>Status<span {...getInboxResizeHandler(3)} /></th>
                <th className="px-4 py-3 text-center" style={{ width: inboxColWidths[4], position: "relative" }}>Action<span {...getInboxResizeHandler(4)} /></th>
              </tr>
            </thead>
            <tbody>
              {filteredEmails.map((e) => {
                const senderDisplay = e.fromName || e.fromEmail;
                return (
                <tr
                  key={e.id}
                  onClick={() => openEmail(e)}
                  className={`border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-hover)] transition cursor-pointer ${
                    !e.read ? "border-l-2 border-l-brand-gold" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className={`font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                      {senderDisplay}
                    </div>
                    <div className="text-xs text-[var(--app-text-muted)]">{e.fromEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                      {e.subject}
                    </div>
                    <div className="text-xs text-[var(--app-text-muted)] truncate max-w-[320px]">
                      {e.textBody.slice(0, 160)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--app-text-secondary)] whitespace-nowrap">
                    {fmtDateTime(e.createdAt)}
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
                    {e.supportTicketId && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 ml-1" title="Linked to a support ticket">
                        Ticket
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(evt) => { evt.stopPropagation(); openEmail(e); }}
                      className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition mr-1"
                    >
                      Reply
                    </button>
                    <button
                      onClick={(evt) => { evt.stopPropagation(); openEmail(e); }}
                      className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition"
                    >
                      View
                    </button>
                  </td>
                </tr>
                );
              })}
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
          {filteredEmails.map((e) => {
            const senderDisplay = e.fromName || e.fromEmail;
            return (
            <div
              key={e.id}
              onClick={() => openEmail(e)}
              className={`card p-4 cursor-pointer ${!e.read ? "border-l-2 border-l-brand-gold" : ""}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className={`font-body text-sm font-medium ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                    {senderDisplay}
                  </div>
                  <div className="font-body text-xs text-[var(--app-text-muted)]">{e.fromEmail}</div>
                </div>
                <span className="font-body text-xs text-[var(--app-text-muted)] whitespace-nowrap">
                  {fmtDateTime(e.createdAt)}
                </span>
              </div>
              <div className={`font-body text-sm font-medium mb-1 ${!e.read ? "text-[var(--app-text)]" : "text-[var(--app-text-secondary)]"}`}>
                {e.subject}
              </div>
              <p className="font-body text-xs text-[var(--app-text-muted)] line-clamp-2 mb-3">
                {e.textBody.slice(0, 160)}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
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
                  {e.supportTicketId && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      Ticket
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(evt) => { evt.stopPropagation(); openEmail(e); }}
                    className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
                  >
                    Reply
                  </button>
                </div>
              </div>
            </div>
            );
          })}
          {filteredEmails.length === 0 && (
            <p className="text-center text-[var(--app-text-muted)] font-body text-sm py-8">
              {inboxLoading
                ? "Loading..."
                : "No inbound emails yet. Messages sent to your inbound.fintella.partners addresses will land here."}
            </p>
          )}
        </div>

        {/* Reply modal */}
        {selectedEmail && (
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setSelectedEmail(null)}
          >
            <div
              className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-display text-lg font-bold">{selectedEmail.subject}</div>
                  <div className="font-body text-xs text-[var(--app-text-muted)] mt-1">
                    From <span className="text-[var(--app-text-secondary)]">{selectedEmail.fromName || selectedEmail.fromEmail}</span>{" "}
                    &lt;{selectedEmail.fromEmail}&gt; · {fmtDateTime(selectedEmail.createdAt)}
                  </div>
                  <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">
                    To <span className="text-[var(--app-text-secondary)]">{selectedEmail.toEmail}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              <div className="border-t border-[var(--app-border)] pt-4 mb-4">
                <div className="font-body text-sm text-[var(--app-text-secondary)] whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {selectedEmail.textBody || "(no text body)"}
                </div>
              </div>

              {selectedEmail.supportTicketId && (
                <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="font-body text-xs text-blue-400">
                    Linked to support ticket. Replies will also post as an admin
                    message on{" "}
                    <a
                      href={`/admin/support?ticket=${selectedEmail.supportTicketId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      the ticket page
                    </a>
                    .
                  </div>
                </div>
              )}

              <div className="border-t border-[var(--app-border)] pt-4">
                <label className="block font-body text-xs text-[var(--app-text-muted)] mb-2">
                  Reply
                </label>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={6}
                  placeholder="Type your reply..."
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] font-body text-sm placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
                />
                {replyError && (
                  <div className="text-xs text-red-400 mt-2">{replyError}</div>
                )}
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setSelectedEmail(null)}
                    className="text-sm px-4 py-2 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendReply}
                    disabled={!replyBody.trim() || replySending}
                    className="btn-gold text-sm px-4 py-2 disabled:opacity-50"
                  >
                    {replySending ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
          <div>
            <h3 className="font-display text-lg font-bold">Email Templates</h3>
            <p className="font-body text-xs text-[var(--app-text-muted)] mt-1">
              Edit any template to change what gets sent on real partner events. Wired templates fire automatically; drafts are placeholders for future automation.
            </p>
          </div>
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
            <h4 className="font-display text-sm font-bold mb-4">New Template (Draft)</h4>
            <p className="font-body text-xs text-[var(--app-text-muted)] mb-4">
              Custom templates start as drafts. They can be edited and persisted but won&apos;t fire on any real partner event until a future PR wires them to a code path.
            </p>
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
                <div className="sm:w-64">
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Key (lowercase, underscores)</label>
                  <input
                    type="text"
                    placeholder="follow_up_reminder"
                    value={newTplKey}
                    onChange={(e) => setNewTplKey(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 font-mono text-xs"
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
                  placeholder="Email subject... (supports {variables})"
                  value={newTplSubject}
                  onChange={(e) => setNewTplSubject(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Body (plain text — HTML auto-generated)</label>
                <textarea
                  placeholder="Template body..."
                  value={newTplBody}
                  onChange={(e) => setNewTplBody(e.target.value)}
                  className="w-full min-h-[150px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
                />
              </div>
              <button
                onClick={handleCreateTemplate}
                disabled={newTplSaving}
                className="self-start px-5 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-50"
              >
                {newTplSaving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        )}

        {/* Loading / error states */}
        {templatesLoading && (
          <div className="font-body text-sm text-[var(--app-text-muted)] py-8 text-center">
            Loading templates...
          </div>
        )}
        {templatesError && (
          <div className="font-body text-sm text-red-400 py-4 px-3 mb-4 rounded border border-red-400/20 bg-red-400/5">
            {templatesError}
          </div>
        )}

        {/* Live / Drafts sub-tabs */}
        {!templatesLoading && (
          <div className="flex gap-1 mb-4 border-b border-[var(--app-border)]">
            {(["live", "drafts"] as const).map((sub) => {
              const count =
                sub === "live"
                  ? templates.filter((t) => !t.isDraft).length
                  : templates.filter((t) => t.isDraft).length;
              return (
                <button
                  key={sub}
                  onClick={() => setTemplatesSubTab(sub)}
                  className={`font-body text-[13px] px-4 py-2.5 transition-colors border-b-2 -mb-px ${
                    templatesSubTab === sub
                      ? "text-brand-gold border-brand-gold"
                      : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
                  }`}
                >
                  {sub === "live" ? "Live" : "Drafts"}{" "}
                  <span className="text-[10px] text-[var(--app-text-faint)]">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Template cards */}
        {!templatesLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {templates
              .filter((t) => (templatesSubTab === "live" ? !t.isDraft : t.isDraft))
              .map((t) => (
              <div key={t.id} className="card p-5">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-display text-sm font-bold">{t.name}</h4>
                      {t.isDraft ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          title="Draft — not yet wired to any code path. Editing has no effect on real partner emails until a future PR connects this template to an event."
                        >
                          Draft
                        </span>
                      ) : (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-lime-500/15 text-lime-400 border border-lime-500/30"
                          title="Live — wired to a real trigger. Edits here change what partners actually receive on the next matching event."
                        >
                          Live
                        </span>
                      )}
                      {!t.enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--app-text-faint)] mt-0.5">
                      key: {t.key}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      categoryBadge[t.category] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                    }`}
                  >
                    {t.category}
                  </span>
                </div>
                <p className="font-body text-xs text-[var(--app-text-muted)] mb-1">
                  <span className="text-[var(--app-text-secondary)]">Subject:</span> {t.subject}
                </p>
                <p className="font-body text-xs text-[var(--app-text-muted)] line-clamp-2 mb-2">
                  {t.bodyText}
                </p>
                {t.fromEmail && (
                  <p className="font-body text-[10px] text-[var(--app-text-faint)] mb-1">
                    <span className="text-[var(--app-text-muted)]">From:</span>{" "}
                    {t.fromName ? `${t.fromName} <${t.fromEmail}>` : t.fromEmail}
                  </p>
                )}
                {t.replyTo && (
                  <p className="font-body text-[10px] text-[var(--app-text-faint)] mb-3">
                    <span className="text-[var(--app-text-muted)]">Reply-To:</span> {t.replyTo}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleUseTemplate(t)}
                    className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
                    title="Pre-fill the Compose tab with this template's content"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => {
                      setEditError(null);
                      setEditingTpl({ ...t });
                    }}
                    className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(t)}
                    className="text-xs px-3 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {templates.length === 0 && !templatesLoading && !templatesError && (
              <div className="font-body text-sm text-[var(--app-text-muted)] py-8 text-center col-span-full">
                No templates yet. Click <strong>Create Template</strong> to add one, or run the seed script to install the default 7.
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // ─── Edit modal ───────────────────────────────────────────────────────
  function renderEditModal() {
    if (!editingTpl) return null;
    const t = editingTpl;
    let availableVars: string[] = [];
    if (t.variables) {
      try {
        availableVars = JSON.parse(t.variables);
      } catch {
        availableVars = [];
      }
    }
    return (
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !editSaving) setEditingTpl(null);
        }}
      >
        <div className="bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl max-w-3xl w-full my-8 overflow-hidden">
          {/* Modal header */}
          <div className="px-6 py-4 border-b border-[var(--app-border)] flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Edit Template</h3>
              <p className="font-mono text-[10px] text-[var(--app-text-faint)] mt-0.5">
                key: {t.key} {t.isDraft && <span className="ml-2 text-amber-400">(DRAFT)</span>}
              </p>
            </div>
            <button
              onClick={() => !editSaving && setEditingTpl(null)}
              disabled={editSaving}
              className="text-2xl text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] disabled:opacity-50"
            >
              ×
            </button>
          </div>

          {/* Modal body */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {t.description && (
              <div className="mb-5 text-xs text-[var(--app-text-muted)] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg p-3 leading-relaxed">
                <strong className="text-[var(--app-text-secondary)]">When this fires:</strong>{" "}
                {t.description}
              </div>
            )}

            {availableVars.length > 0 && (
              <div className="mb-5 text-xs bg-brand-gold/5 border border-brand-gold/20 rounded-lg p-3">
                <div className="font-semibold text-brand-gold mb-2">Available variables</div>
                <div className="flex flex-wrap gap-1.5">
                  {availableVars.map((v) => (
                    <code
                      key={v}
                      className="px-2 py-0.5 rounded bg-brand-gold/10 text-brand-gold text-[11px] font-mono cursor-pointer hover:bg-brand-gold/20"
                      onClick={() => navigator.clipboard.writeText(`{${v}}`)}
                      title="Click to copy"
                    >
                      {`{${v}}`}
                    </code>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-[var(--app-text-muted)]">
                  Click any variable to copy. Use them in the subject, heading, body, or CTA URL — they&apos;re replaced at send time with values from the partner record.
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Name + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Name</label>
                  <input
                    type="text"
                    value={t.name}
                    onChange={(e) => setEditingTpl({ ...t, name: e.target.value })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Category</label>
                  <select
                    value={t.category}
                    onChange={(e) => setEditingTpl({ ...t, category: e.target.value })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>
                    ))}
                    {!categoryOptions.includes(t.category) && (
                      <option value={t.category} className="bg-[#1a1a2e]">{t.category}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Subject Line</label>
                <input
                  type="text"
                  value={t.subject}
                  onChange={(e) => setEditingTpl({ ...t, subject: e.target.value })}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)] font-mono"
                />
              </div>

              {/* Preheader */}
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">
                  Preheader <span className="text-[var(--app-text-faint)]">(hidden inbox preview text)</span>
                </label>
                <input
                  type="text"
                  value={t.preheader || ""}
                  onChange={(e) => setEditingTpl({ ...t, preheader: e.target.value || null })}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                />
              </div>

              {/* Heading */}
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">
                  Heading <span className="text-[var(--app-text-faint)]">(h1 inside the email)</span>
                </label>
                <input
                  type="text"
                  value={t.heading}
                  onChange={(e) => setEditingTpl({ ...t, heading: e.target.value })}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                />
              </div>

              {/* Body HTML */}
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">
                  Body HTML <span className="text-[var(--app-text-faint)]">(wrapped in shell at send time; supports {`{variables}`})</span>
                </label>
                <textarea
                  value={t.bodyHtml}
                  onChange={(e) => setEditingTpl({ ...t, bodyHtml: e.target.value })}
                  className="w-full min-h-[120px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-xs text-[var(--app-text)] font-mono resize-y"
                />
              </div>

              {/* Body Text */}
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">
                  Body Plain Text <span className="text-[var(--app-text-faint)]">(must be authored — not auto-derived from HTML)</span>
                </label>
                <textarea
                  value={t.bodyText}
                  onChange={(e) => setEditingTpl({ ...t, bodyText: e.target.value })}
                  className="w-full min-h-[100px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-xs text-[var(--app-text)] resize-y"
                />
              </div>

              {/* CTA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">CTA Button Label</label>
                  <input
                    type="text"
                    value={t.ctaLabel || ""}
                    onChange={(e) => setEditingTpl({ ...t, ctaLabel: e.target.value || null })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">CTA URL</label>
                  <input
                    type="text"
                    value={t.ctaUrl || ""}
                    onChange={(e) => setEditingTpl({ ...t, ctaUrl: e.target.value || null })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)] font-mono"
                  />
                </div>
              </div>

              {/* From / Reply-To */}
              <div className="border-t border-[var(--app-border)] pt-4">
                <div className="text-xs text-[var(--app-text-muted)] mb-3 font-semibold">
                  Sender Overrides <span className="font-normal">(leave blank to use the global SENDGRID_FROM_EMAIL / SENDGRID_FROM_NAME from Vercel)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[var(--app-text-muted)] text-xs mb-1">From Email</label>
                    <input
                      type="email"
                      placeholder="noreply@fintella.partners"
                      value={t.fromEmail || ""}
                      onChange={(e) => setEditingTpl({ ...t, fromEmail: e.target.value || null })}
                      className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--app-text-muted)] text-xs mb-1">From Name</label>
                    <input
                      type="text"
                      placeholder="Fintella"
                      value={t.fromName || ""}
                      onChange={(e) => setEditingTpl({ ...t, fromName: e.target.value || null })}
                      className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--app-text-muted)] text-xs mb-1">Reply-To</label>
                    <input
                      type="email"
                      placeholder="support@fintella.partners"
                      value={t.replyTo || ""}
                      onChange={(e) => setEditingTpl({ ...t, replyTo: e.target.value || null })}
                      className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                    />
                  </div>
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="tpl-enabled"
                  checked={t.enabled}
                  onChange={(e) => setEditingTpl({ ...t, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="tpl-enabled" className="text-xs text-[var(--app-text-secondary)]">
                  <span className="font-semibold">Enabled</span> — when unchecked, this template is skipped at send time and the hardcoded fallback in <code className="font-mono text-[10px]">src/lib/sendgrid.ts</code> is used instead.
                </label>
              </div>

              {editError && (
                <div className="text-xs text-red-400 py-2 px-3 rounded border border-red-400/20 bg-red-400/5">
                  {editError}
                </div>
              )}
            </div>
          </div>

          {/* Modal footer */}
          <div className="px-6 py-4 border-t border-[var(--app-border)] flex justify-end gap-2">
            <button
              onClick={() => setEditingTpl(null)}
              disabled={editSaving}
              className="text-sm px-4 py-2 rounded font-body text-[var(--app-text-muted)] border border-[var(--app-border)] hover:text-[var(--app-text-secondary)] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={editSaving}
              className="text-sm px-5 py-2 rounded font-body font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-50"
            >
              {editSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
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

  /* ---------------------------------------------------------------- */
  /*  Phone tab — unified call audit across all partners               */
  /* ---------------------------------------------------------------- */
  function renderPhone() {
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
      {activeTab === "Phone" && renderPhone()}

      {/* Edit template modal — rendered at the page root so its overlay
          covers everything regardless of which tab is active */}
      {renderEditModal()}
    </div>
  );
}
