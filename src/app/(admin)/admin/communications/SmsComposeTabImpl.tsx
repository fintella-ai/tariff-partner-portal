"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SMS_COMPOSE_PREFILL_KEY = "comms.sms.compose.prefill";

function consumeSmsComposePrefill(): { body: string; templateKey?: string } | null {
  try {
    const raw = sessionStorage.getItem(SMS_COMPOSE_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SMS_COMPOSE_PREFILL_KEY);
    const parsed = JSON.parse(raw);
    if (typeof parsed?.body === "string") return parsed;
  } catch {}
  return null;
}

type PartnerLite = {
  id: string;
  partnerCode: string;
  firstName: string;
  lastName: string;
  mobilePhone: string | null;
  smsOptIn: boolean;
};

type SmsTemplateLite = { id: string; key: string; name: string; category: string; body: string };

/**
 * SMS → Compose sub-tab. Same shape as EmailComposeTabImpl: partner
 * autocomplete, optional template picker, per-recipient or opted-in-broadcast.
 *
 * Bulk-to-opted-in is exposed via a checkbox — when on, the recipient
 * selector is replaced with "All opted-in partners ({n})" and the send
 * posts to /api/admin/sms/bulk mode=to_opted_in.
 *
 * Only sends to opted-in partners on the single-send path. The backend
 * enforces TCPA; this UI surfaces the rule so admins don't pick an
 * unopted partner and wonder why the send skipped.
 */
export default function SmsComposeTabImpl() {
  const [optedInCount, setOptedInCount] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PartnerLite[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [partner, setPartner] = useState<PartnerLite | null>(null);
  const [bulk, setBulk] = useState(false);
  const [message, setMessage] = useState("");
  const [templates, setTemplates] = useState<SmsTemplateLite[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const charCount = message.length;

  useEffect(() => {
    fetch("/api/admin/sms-templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(Array.isArray(d.templates) ? d.templates : []))
      .catch(() => setTemplates([]));
    fetch("/api/admin/sms/partners")
      .then((r) => (r.ok ? r.json() : { optedIn: [] }))
      .then((d) => setOptedInCount(Array.isArray(d.optedIn) ? d.optedIn.length : 0))
      .catch(() => setOptedInCount(0));

    // Consume a one-shot prefill stashed by SmsTemplatesTabImpl's "Use" button.
    const prefill = consumeSmsComposePrefill();
    if (prefill) {
      setMessage(prefill.body);
      if (prefill.templateKey) setTemplateKey(prefill.templateKey);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q || q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/partners?search=${encodeURIComponent(q)}`);
        const d = await res.json();
        const filtered: PartnerLite[] = Array.isArray(d.partners)
          ? d.partners.filter((p: any) => p.mobilePhone && p.smsOptIn).slice(0, 8)
          : [];
        setResults(filtered);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function applyTemplate(key: string) {
    setTemplateKey(key);
    if (!key) return;
    const tpl = templates.find((t) => t.key === key);
    if (tpl) setMessage(tpl.body);
  }

  const canSend = useMemo(() => {
    if (!message.trim() || sending) return false;
    if (bulk) return optedInCount > 0;
    return !!partner;
  }, [message, sending, bulk, partner, optedInCount]);

  async function handleSend() {
    if (!canSend) return;
    if (bulk) {
      if (!confirm(`Send this SMS to ${optedInCount} opted-in partner(s)?`)) return;
    }
    setSending(true);
    setStatus(null);
    try {
      const url = bulk ? "/api/admin/sms/bulk" : "/api/admin/sms/send";
      const body = bulk
        ? JSON.stringify({ mode: "to_opted_in", body: message })
        : JSON.stringify({ partnerCode: partner!.partnerCode, body: message });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: "err", text: data.error || "Send failed" });
      } else if (bulk) {
        setStatus({ kind: "ok", text: `Fanned out to ${data.sent || 0} partner(s).` });
        setMessage("");
        setTemplateKey("");
      } else {
        const s = data.status;
        const msg = s === "demo" ? "Demo mode — logged but not actually sent." :
                    s === "sent" ? "SMS sent." :
                    s === "skipped_optout" ? "Skipped — partner is not opted in." :
                    s === "failed" ? `Send failed: ${data.error || "unknown"}` :
                    `Status: ${s}`;
        setStatus({ kind: s === "failed" ? "err" : "ok", text: msg });
        if (s !== "failed") {
          setMessage("");
          setTemplateKey("");
        }
      }
    } catch (e: any) {
      setStatus({ kind: "err", text: e?.message || "Network error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card p-5 mb-4">
      <h4 className="font-display text-sm font-bold mb-4">Compose SMS</h4>
      <div className="flex flex-col gap-4 font-body text-sm">
        {/* Bulk toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={bulk}
            onChange={(e) => { setBulk(e.target.checked); setPartner(null); }}
            className="accent-brand-gold w-4 h-4"
          />
          <span className="text-[var(--app-text-secondary)] text-xs">
            Send to all opted-in partners ({optedInCount})
          </span>
        </label>

        {/* To */}
        {!bulk && (
          <div ref={wrapRef} className="relative">
            <label className="block text-[var(--app-text-muted)] text-xs mb-1">To (opted-in only)</label>
            {partner ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)]">
                  {partner.firstName} {partner.lastName}
                  <span className="font-mono text-xs text-[var(--app-text-muted)] ml-2">{partner.partnerCode}</span>
                </div>
                <button
                  onClick={() => { setPartner(null); setQuery(""); }}
                  className="text-xs text-[var(--app-text-muted)] hover:text-red-400 transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Type partner name or code..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
                {showDropdown && results.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-[var(--app-popover-bg)] border border-[var(--app-border)] rounded-lg shadow-lg max-h-64 overflow-auto">
                    {results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setPartner(p); setShowDropdown(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--app-input-bg)] border-b border-[var(--app-border)] last:border-b-0 transition"
                      >
                        <div className="text-[var(--app-text)] text-sm">
                          {p.firstName} {p.lastName}
                          <span className="text-[var(--app-text-muted)] text-xs ml-2">{p.partnerCode}</span>
                        </div>
                        <div className="text-[var(--app-text-muted)] text-xs font-mono">{p.mobilePhone}</div>
                      </button>
                    ))}
                  </div>
                )}
                {query.length >= 2 && results.length === 0 && (
                  <div className="text-[11px] text-[var(--app-text-muted)] mt-1">
                    No opted-in partner matches. Use the bulk toggle if you meant to target everyone.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Template picker */}
        <div>
          <label className="block text-[var(--app-text-muted)] text-xs mb-1">
            Template <span className="text-[var(--app-text-faint)]">(optional — prefills body)</span>
          </label>
          <select
            value={templateKey}
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] focus:outline-none focus:border-brand-gold/50"
          >
            <option value="">— No template —</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>{t.name} ({t.category})</option>
            ))}
          </select>
        </div>

        {/* Message */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[var(--app-text-muted)] text-xs">Message</label>
            <span className={`text-xs ${charCount > 160 ? "text-red-400" : "text-[var(--app-text-muted)]"}`}>
              {charCount}/160
            </span>
          </div>
          <textarea
            placeholder="Type your SMS message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={320}
            className="w-full min-h-[80px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
          />
        </div>

        {status && (
          <div className={`text-xs px-3 py-2 rounded border ${
            status.kind === "ok"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          }`}>
            {status.text}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={!canSend}
          className="self-start px-5 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Sending…" : bulk ? `Send SMS to ${optedInCount} partners` : "Send SMS"}
        </button>
      </div>
    </div>
  );
}
