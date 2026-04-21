"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALLOWED_SENDER_EMAILS } from "@/lib/constants";

type PartnerLite = {
  id: string;
  partnerCode: string;
  email: string;
  firstName: string;
  lastName: string;
};

type TemplateLite = { key: string; name: string; category: string };

export interface ComposeEmailFormProps {
  /** Prefill the recipient email address. */
  initialToEmail?: string;
  /** Prefill display name shown next to the email. */
  initialToName?: string;
  /** Prefill partner code (attributes EmailLog + lets backend resolve `to`). */
  initialPartnerCode?: string;
  /**
   * When true, the To field is read-only and the partner autocomplete is
   * hidden. Used by the partner detail page where the recipient is locked
   * to the partner whose page is open.
   */
  lockTo?: boolean;
  /** Optional prefill for subject (e.g. from Templates → Compose). */
  initialSubject?: string;
  /** Optional prefill for body. */
  initialBody?: string;
  /** Fired after a successful send so the host can refresh logs, toast, etc. */
  onSent?: (result: { status: string; messageId: string | null }) => void;
}

/**
 * Shared compose form for admin → partner email. Used inside the
 * Communications hub Compose tab and inline on the partner detail page.
 *
 * Recipient resolution:
 *   - `lockTo=true` renders the recipient as a read-only display.
 *   - Otherwise, the admin types a name/email into a debounced autocomplete
 *     that queries `/api/admin/partners?search=` and lets the admin pick a
 *     partner or free-type any arbitrary email.
 *
 * From dropdown is pinned to `ALLOWED_SENDER_EMAILS` — anything else would
 * either render a broken address or silently fall back to the env default.
 *
 * Template picker fetches `/api/admin/email-templates/keys` (enabled+live
 * templates only) and prefills subject + plain-text body on select. The
 * picker is a convenience — it's optional and can be left blank to send a
 * one-off message.
 */
export default function ComposeEmailForm({
  initialToEmail = "",
  initialToName = "",
  initialPartnerCode = "",
  lockTo = false,
  initialSubject = "",
  initialBody = "",
  onSent,
}: ComposeEmailFormProps) {
  const [toEmail, setToEmail] = useState(initialToEmail);
  const [toName, setToName] = useState(initialToName);
  const [partnerCode, setPartnerCode] = useState(initialPartnerCode);

  const [toSearch, setToSearch] = useState(
    initialToEmail ? (initialToName ? `${initialToName} <${initialToEmail}>` : initialToEmail) : ""
  );
  const [partnerResults, setPartnerResults] = useState<PartnerLite[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [fromEmail, setFromEmail] = useState<string>(ALLOWED_SENDER_EMAILS[0] || "");
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [subject, setSubject] = useState(initialSubject);
  const [bodyText, setBodyText] = useState(initialBody);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);

  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Load template options once on mount
  useEffect(() => {
    fetch("/api/admin/email-templates/keys")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(Array.isArray(d.templates) ? d.templates : []))
      .catch(() => setTemplates([]));
  }, []);

  // Debounced partner search. Skips when the user has selected a partner
  // (toSearch equals the chosen display value) so we don't re-fire after pick.
  useEffect(() => {
    if (lockTo) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = toSearch.trim();
    if (!q || q.length < 2) {
      setPartnerResults([]);
      return;
    }
    // If the current search string exactly matches the selected partner's
    // "Name <email>" form, no need to query again.
    if (toEmail && toSearch === (toName ? `${toName} <${toEmail}>` : toEmail)) {
      setPartnerResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/partners?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        setPartnerResults(Array.isArray(data.partners) ? data.partners.slice(0, 8) : []);
      } catch {
        setPartnerResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [toSearch, lockTo, toEmail, toName]);

  // Click-outside closes the suggestion dropdown
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pickPartner(p: PartnerLite) {
    const display = `${p.firstName} ${p.lastName}`.trim();
    setToEmail(p.email);
    setToName(display);
    setPartnerCode(p.partnerCode);
    setToSearch(`${display} <${p.email}>`);
    setPartnerResults([]);
    setShowDropdown(false);
  }

  // When the admin free-types something that doesn't match a partner row,
  // treat the raw string as a plain email address if it looks like one.
  function commitFreeText(raw: string) {
    const s = raw.trim();
    if (!s) {
      setToEmail("");
      setToName("");
      setPartnerCode("");
      return;
    }
    // Support "Name <email@x>" shape
    const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (m) {
      setToName(m[1]);
      setToEmail(m[2].trim());
      setPartnerCode("");
      return;
    }
    if (s.includes("@")) {
      setToEmail(s);
      setToName("");
      setPartnerCode("");
    }
  }

  async function applyTemplate(key: string) {
    setTemplateKey(key);
    if (!key) return;
    setLoadingTemplate(true);
    try {
      const res = await fetch(`/api/admin/email-templates/by-key/${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error("Template fetch failed");
      const data = await res.json();
      const tpl = data.template;
      if (tpl?.subject) setSubject(tpl.subject);
      if (tpl?.bodyText) setBodyText(tpl.bodyText);
      if (tpl?.fromEmail && ALLOWED_SENDER_EMAILS.includes(tpl.fromEmail)) {
        setFromEmail(tpl.fromEmail);
      }
    } catch {
      // Soft-fail — admin can retype or pick a different template
    } finally {
      setLoadingTemplate(false);
    }
  }

  const canSend = useMemo(
    () => !!toEmail && !!subject.trim() && !!bodyText.trim() && !sending,
    [toEmail, subject, bodyText, sending]
  );

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toEmail,
          toName: toName || undefined,
          partnerCode: partnerCode || undefined,
          subject,
          body: bodyText,
          fromEmail,
          cc: cc || undefined,
          bcc: bcc || undefined,
          templateKey: templateKey || "compose",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMsg({ kind: "err", text: data.error || "Failed to send email" });
      } else {
        const stat = data.status === "demo"
          ? "Demo mode — logged but not actually sent (SendGrid not configured)."
          : data.status === "sent"
            ? "Email sent."
            : data.status === "failed"
              ? `Send failed: ${data.error || "unknown error"}`
              : `Status: ${data.status}`;
        setStatusMsg({ kind: data.status === "failed" ? "err" : "ok", text: stat });
        if (data.status !== "failed") {
          onSent?.({ status: data.status, messageId: data.messageId });
          // Reset body/subject so the form is ready for the next send; keep To/From/template for follow-ups.
          setSubject("");
          setBodyText("");
          setTemplateKey("");
        }
      }
    } catch (e: any) {
      setStatusMsg({ kind: "err", text: e?.message || "Network error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 font-body text-sm">
      {/* To */}
      <div ref={wrapRef} className="relative">
        <label className="block text-[var(--app-text-muted)] text-xs mb-1">To</label>
        {lockTo ? (
          <div className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)]">
            {toName ? `${toName} <${toEmail}>` : toEmail || "(no recipient)"}
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Type partner name or email..."
              value={toSearch}
              onChange={(e) => {
                setToSearch(e.target.value);
                setShowDropdown(true);
                commitFreeText(e.target.value);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
            />
            {showDropdown && (partnerResults.length > 0 || searching) && (
              <div className="absolute z-20 mt-1 w-full bg-[var(--app-popover-bg)] border border-[var(--app-border)] rounded-lg shadow-lg max-h-64 overflow-auto">
                {searching && (
                  <div className="px-3 py-2 text-xs text-[var(--app-text-muted)]">Searching...</div>
                )}
                {partnerResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPartner(p)}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--app-input-bg)] border-b border-[var(--app-border)] last:border-b-0 transition"
                  >
                    <div className="text-[var(--app-text)] text-sm">
                      {p.firstName} {p.lastName}
                      <span className="text-[var(--app-text-muted)] text-xs ml-2">{p.partnerCode}</span>
                    </div>
                    <div className="text-[var(--app-text-muted)] text-xs">{p.email}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* From + Template */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-[var(--app-text-muted)] text-xs mb-1">From</label>
          <select
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] focus:outline-none focus:border-brand-gold/50"
          >
            {ALLOWED_SENDER_EMAILS.map((addr) => (
              <option key={addr} value={addr}>{addr}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[var(--app-text-muted)] text-xs mb-1">
            Template <span className="text-[var(--app-text-faint)]">(optional — prefills subject + body)</span>
          </label>
          <select
            value={templateKey}
            onChange={(e) => applyTemplate(e.target.value)}
            disabled={loadingTemplate}
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] focus:outline-none focus:border-brand-gold/50 disabled:opacity-60"
          >
            <option value="">— No template —</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name} ({t.category})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CC / BCC toggle */}
      <button
        type="button"
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
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[var(--app-text-muted)] text-xs mb-1">BCC</label>
            <input
              type="text"
              placeholder="BCC recipients..."
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
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
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
        />
      </div>

      {/* Body */}
      <div>
        <label className="block text-[var(--app-text-muted)] text-xs mb-1">Body</label>
        <textarea
          placeholder="Write your message..."
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          className="w-full min-h-[220px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
        />
      </div>

      {statusMsg && (
        <div
          className={`text-xs px-3 py-2 rounded border ${
            statusMsg.kind === "ok"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="px-6 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending..." : "Send Email"}
        </button>
      </div>
    </div>
  );
}
