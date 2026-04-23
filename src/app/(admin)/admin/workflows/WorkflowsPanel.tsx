"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import {
  TRIGGER_KEYS,
  TRIGGER_LABELS,
  TRIGGER_DESCRIPTIONS,
  TRIGGER_VARIABLES,
  ACTION_TYPES,
  ACTION_LABELS,
  ACTION_DESCRIPTIONS,
  type TriggerKey,
  type ActionType,
} from "@/lib/workflow-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowLog {
  id: string;
  createdAt: string;
  workflowId: string;
  triggerKey: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  triggerData: unknown;
  actionsRun: unknown;
  workflow: { id: string; name: string; trigger: string } | null;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: string;
  triggerConfig: unknown;
  conditions: unknown;
  actions: unknown;
  logs: { createdAt: string; status: string }[];
}

interface WebhookSource {
  id: string;
  name: string;
  slug: string;
  apiKey: string;
  enabled: boolean;
  description: string | null;
  actions: unknown;
  requestCount: number;
  lastHitAt: string | null;
}

interface ActionConfig {
  type: ActionType;
  // Values are usually strings, but some action types (e.g. webhook.post)
  // store structured config like a nested `headers` object. Keep the
  // outer map permissive and let each action's editor narrow as needed.
  config: Record<string, unknown>;
}

// ─── Condition editor helpers ─────────────────────────────────────────────────

const OPS = ["eq", "neq", "gt", "lt", "contains", "exists", "not_exists"] as const;

// Plain-English labels for each operator. Keeps the data model technical
// (engine reads "eq" / "not_exists") but the admin UI reads naturally.
const OP_LABELS: Record<(typeof OPS)[number], string> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  lt: "is less than",
  contains: "contains",
  exists: "is known",
  not_exists: "is unknown",
};

interface Condition {
  field: string;
  op: typeof OPS[number];
  value: string;
}

// ─── Smart defaults per trigger ───────────────────────────────────────────────
// Reminder + partner-lifecycle triggers have an obvious "who to email" and
// "who to text" — surface those as "The matching X" radio options in the
// action editor so admins don't have to type {partner.email} by hand. For
// triggers without an obvious recipient the UI falls back to the plain
// Someone-else email input.

type TriggerDefaults = {
  emailToken: string | null;         // {partner.email}, {deal.clientEmail}, {invite.invitedEmail}
  emailLabel: string;                 // "The matching partner"
  smsSubject: "deal_partner" | null;  // sms.send uses deal_partner to auto-resolve
  smsLabel: string;
};

const TRIGGER_DEFAULTS: Record<string, TriggerDefaults> = {
  "partner.agreement_reminder": { emailToken: "{partner.email}",        emailLabel: "The partner with the unsigned agreement", smsSubject: "deal_partner", smsLabel: "The partner with the unsigned agreement" },
  "partner.invite_reminder":    { emailToken: "{invite.invitedEmail}",  emailLabel: "The invited person",                       smsSubject: null,            smsLabel: "" },
  "conference.call_reminder":   { emailToken: "{partner.email}",        emailLabel: "Every active partner (one send per partner)", smsSubject: "deal_partner", smsLabel: "Every active partner (one send per partner)" },
  "partner.created":            { emailToken: "{partner.email}",        emailLabel: "The new partner",                          smsSubject: "deal_partner", smsLabel: "The new partner" },
  "partner.activated":          { emailToken: "{partner.email}",        emailLabel: "The activated partner",                    smsSubject: "deal_partner", smsLabel: "The activated partner" },
  "deal.created":               { emailToken: "{deal.clientEmail}",     emailLabel: "The client on the deal",                   smsSubject: "deal_partner", smsLabel: "The submitting partner" },
  "deal.stage_changed":         { emailToken: "{deal.clientEmail}",     emailLabel: "The client on the deal",                   smsSubject: "deal_partner", smsLabel: "The submitting partner" },
  "deal.closed_won":            { emailToken: "{deal.clientEmail}",     emailLabel: "The client on the deal",                   smsSubject: "deal_partner", smsLabel: "The submitting partner" },
  "deal.closed_lost":           { emailToken: "{deal.clientEmail}",     emailLabel: "The client on the deal",                   smsSubject: "deal_partner", smsLabel: "The submitting partner" },
  "sms.opt_in":                 { emailToken: "{partner.email}",        emailLabel: "The partner who opted in",                 smsSubject: "deal_partner", smsLabel: "The partner who opted in" },
  "sms.opt_out":                { emailToken: "{partner.email}",        emailLabel: "The partner who opted out",                smsSubject: null,            smsLabel: "" },
};

// ─── Action editor ─────────────────────────────────────────────────────────────

// ─── Variable reference (click-to-copy chips) ─────────────────────────────────

function VariableReference({ trigger }: { trigger: TriggerKey | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const vars = trigger ? TRIGGER_VARIABLES[trigger] : [];
  if (!trigger || vars.length === 0) return null;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // clipboard may be blocked — silent fallback
    }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
  };

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="font-body text-xs theme-text-secondary hover:text-brand-gold transition-colors"
        type="button"
      >
        {open ? "▾" : "▸"} Available variables for {TRIGGER_LABELS[trigger]}
        <span className="ml-2 text-[var(--app-text-faint)]">({vars.length})</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="font-body text-[11px] theme-text-muted leading-relaxed">
            Click a chip to copy its token. Use in action text (e.g. Notification message,
            Deal note, Email recipient) — the engine replaces it with the real value at fire time.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {vars.map((v) => (
              <button
                key={v.token}
                onClick={() => copy(v.token)}
                title={`${v.description}${v.example ? ` — e.g. ${v.example}` : ""}`}
                className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
                  copied === v.token
                    ? "bg-green-500/15 border-green-500/40 text-green-400"
                    : "bg-[var(--app-input-bg)] border-[var(--app-border)] text-brand-gold hover:border-brand-gold/40"
                }`}
                type="button"
              >
                {copied === v.token ? "Copied!" : v.token}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Email template picker (dropdown of live templates + custom fallback) ─────

interface EmailTemplateKey { key: string; name: string; category: string | null }

function EmailTemplatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplateKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [customMode, setCustomMode] = useState(false);

  useEffect(() => {
    fetch("/api/admin/email-templates/keys")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => {
        const list = Array.isArray(d.templates) ? d.templates : [];
        setTemplates(list);
        setLoaded(true);
        // If the saved value isn't one of the known keys, flip into custom
        // mode so the admin can still see + edit it.
        if (value && !list.some((t: EmailTemplateKey) => t.key === value)) {
          setCustomMode(true);
        }
      })
      .catch(() => setLoaded(true));
  }, [value]);

  if (customMode) {
    return (
      <div className="flex gap-2 items-center">
        <input
          placeholder="Custom template key"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded px-2 py-1.5 font-body text-sm theme-input font-mono"
        />
        <button
          type="button"
          onClick={() => { setCustomMode(false); onChange(""); }}
          className="font-body text-[11px] theme-text-muted hover:text-brand-gold transition-colors"
        >
          Use list
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__custom__") { setCustomMode(true); onChange(""); return; }
        onChange(e.target.value);
      }}
      className="w-full rounded px-2 py-1.5 font-body text-sm theme-input"
    >
      <option value="">{loaded ? "Select a template…" : "Loading templates…"}</option>
      {templates.map((t) => (
        <option key={t.key} value={t.key}>
          {t.name}{t.category ? ` — ${t.category}` : ""}
        </option>
      ))}
      <option value="__custom__">Custom key…</option>
    </select>
  );
}

// ─── Webhook.post action editor — URL + headers (kv) + body template ──────

type WebhookPostConfig = {
  url?: string;
  headers?: Record<string, string>;
  body?: string;
};

function WebhookPostEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (patch: Partial<WebhookPostConfig>) => void;
}) {
  // Represent headers as an ordered list of [key, value] pairs while the
  // admin edits, then flatten to a Record<string, string> on save. Using
  // indices as React keys means rows stay stable across renames and we
  // avoid the key-collision drama of Object-in-state.
  const raw = (config.headers ?? {}) as Record<string, string>;
  const [rows, setRows] = useState<[string, string][]>(
    Object.entries(raw).length > 0 ? Object.entries(raw) : []
  );

  function pushRows(next: [string, string][]) {
    setRows(next);
    const obj: Record<string, string> = {};
    for (const [k, v] of next) {
      if (k.trim().length > 0) obj[k] = v;
    }
    onChange({ headers: obj });
  }

  const bodyVal = typeof config.body === "string" ? config.body : "";

  return (
    <>
      <input
        placeholder="POST URL (required) — e.g. https://partner.example.com/api/referrals"
        value={(config.url as string) || ""}
        onChange={(e) => onChange({ url: e.target.value })}
        className="w-full rounded px-2 py-1.5 font-body text-sm theme-input font-mono"
      />

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-body text-[11px] theme-text-faint uppercase tracking-wider">Headers</span>
          <button
            type="button"
            onClick={() => pushRows([...rows, ["", ""]])}
            className="font-body text-[11px] theme-text-muted hover:text-brand-gold transition-colors"
          >
            + Add Header
          </button>
        </div>
        <div className="space-y-1">
          {rows.length === 0 && (
            <div className="font-body text-[11px] theme-text-faint italic">
              Defaults to <code className="font-mono">Content-Type: application/json</code>. Add custom headers (e.g. <code className="font-mono">Authorization: Bearer xyz</code>) here.
            </div>
          )}
          {rows.map(([k, v], idx) => (
            <div key={idx} className="flex gap-1">
              <input
                placeholder="Header name (e.g. Authorization)"
                value={k}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = [e.target.value, v];
                  pushRows(next);
                }}
                className="flex-1 rounded px-2 py-1.5 font-body text-xs theme-input font-mono"
              />
              <input
                placeholder="Value — supports {deal.id} etc."
                value={v}
                onChange={(e) => {
                  const next = [...rows];
                  next[idx] = [k, e.target.value];
                  pushRows(next);
                }}
                className="flex-1 rounded px-2 py-1.5 font-body text-xs theme-input font-mono"
              />
              <button
                type="button"
                onClick={() => pushRows(rows.filter((_, j) => j !== idx))}
                className="font-body text-sm text-red-500 hover:text-red-400 px-2 py-1 rounded transition-colors"
                style={{ border: "1px solid var(--app-border)" }}
                title="Remove header"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-body text-[11px] theme-text-faint uppercase tracking-wider">Body Template</span>
          <span className="font-body text-[10px] theme-text-faint">JSON with <code className="font-mono">{"{deal.field}"}</code> tokens</span>
        </div>
        <textarea
          rows={10}
          placeholder={`{\n  "partner_code": "{deal.partnerCode}",\n  "dealId": "{deal.id}",\n  "first_name": "{deal.clientFirstName}",\n  "last_name": "{deal.clientLastName}",\n  "email": "{deal.clientEmail}"\n}\n\nLeave empty to send the raw trigger payload as JSON.`}
          value={bodyVal}
          onChange={(e) => onChange({ body: e.target.value })}
          className="w-full rounded px-2 py-1.5 font-body text-xs theme-input font-mono resize-y"
        />
        <div className="font-body text-[10px] theme-text-faint mt-1">
          Tokens are substituted at fire time. Use the variable chips above to copy exact field names. If the body can&rsquo;t be parsed as JSON, the request still sends with the raw string — set <code className="font-mono">Content-Type</code> in headers accordingly.
        </div>
      </div>
    </>
  );
}

// Plain-English action type labels + emoji for the card header.
const ACTION_DISPLAY: Record<ActionType, { icon: string; label: string }> = {
  "email.send":          { icon: "📧", label: "Send Email" },
  "sms.send":            { icon: "📱", label: "Send Text (SMS)" },
  "notification.create": { icon: "🔔", label: "Create Notification" },
  "deal.note":           { icon: "📝", label: "Add Note to Deal" },
  "webhook.post":        { icon: "🌐", label: "POST to Webhook URL" },
};

function ActionEditor({
  actions,
  onChange,
  trigger,
}: {
  actions: ActionConfig[];
  onChange: (a: ActionConfig[]) => void;
  trigger: TriggerKey | null;
}) {
  const defaults = trigger ? TRIGGER_DEFAULTS[trigger] : undefined;

  function addAction(type: ActionType = "email.send") {
    // Pre-fill smart defaults based on the current trigger so the new card
    // lands in a "ready to save" state when a recipient can be inferred.
    const config: Record<string, unknown> = {};
    if (type === "email.send" && defaults?.emailToken) {
      config.recipientEmail = defaults.emailToken;
      config.recipientMode = "matching";
    }
    if (type === "sms.send" && defaults?.smsSubject) {
      config.partnerCode = defaults.smsSubject;
      config.recipientMode = "matching";
    }
    onChange([...actions, { type, config }]);
  }
  function removeAction(i: number) {
    onChange(actions.filter((_, idx) => idx !== i));
  }
  function updateType(i: number, type: ActionType) {
    const next = [...actions];
    const config: Record<string, unknown> = {};
    if (type === "email.send" && defaults?.emailToken) {
      config.recipientEmail = defaults.emailToken;
      config.recipientMode = "matching";
    }
    if (type === "sms.send" && defaults?.smsSubject) {
      config.partnerCode = defaults.smsSubject;
      config.recipientMode = "matching";
    }
    next[i] = { type, config };
    onChange(next);
  }
  function updateConfig(i: number, key: string, val: unknown) {
    const next = [...actions];
    next[i] = { ...next[i], config: { ...next[i].config, [key]: val } };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {actions.length === 0 && (
        <div className="rounded-lg px-4 py-6 text-center font-body text-[13px] theme-text-muted" style={{ border: "1px dashed var(--app-border)", background: "var(--app-bg-secondary)" }}>
          No actions yet. Click the green button below to add one.
        </div>
      )}

      {actions.map((a, i) => {
        const display = ACTION_DISPLAY[a.type];
        return (
        <div key={i} className="rounded-lg p-4 space-y-3" style={{ border: "1px solid var(--app-border)", background: "var(--app-bg-secondary)" }}>
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>{display.icon}</span>
            <select
              value={a.type}
              onChange={(e) => updateType(i, e.target.value as ActionType)}
              className="flex-1 rounded px-2 py-1.5 font-body text-sm font-semibold theme-input"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>{ACTION_DISPLAY[t].icon} {ACTION_DISPLAY[t].label}</option>
              ))}
            </select>
            <button
              onClick={() => removeAction(i)}
              className="font-body text-[11px] text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors"
              style={{ border: "1px solid var(--app-border)" }}
              title="Remove this action"
            >
              Remove
            </button>
          </div>

          {a.type === "webhook.post" && (
            <WebhookPostEditor
              config={a.config}
              onChange={(patch) => {
                const next = [...actions];
                next[i] = { ...next[i], config: { ...next[i].config, ...patch } };
                onChange(next);
              }}
            />
          )}

          {a.type === "notification.create" && (
            <>
              <div>
                <label className="block font-body text-xs theme-text-muted mb-1">Notification title</label>
                <input
                  placeholder="e.g. New deal received"
                  value={String(a.config.title ?? "")}
                  onChange={(e) => updateConfig(i, "title", e.target.value)}
                  className="w-full rounded px-3 py-2 font-body text-sm theme-input"
                />
              </div>
              <div>
                <label className="block font-body text-xs theme-text-muted mb-1">Message</label>
                <textarea
                  placeholder="e.g. {deal.clientName} submitted a new lead"
                  value={String(a.config.message ?? "")}
                  onChange={(e) => updateConfig(i, "message", e.target.value)}
                  rows={2}
                  className="w-full rounded px-3 py-2 font-body text-sm theme-input resize-none"
                />
                <div className="mt-1 font-body text-[11px] theme-text-faint">Use <code className="font-mono">{"{deal.field}"}</code>-style tokens to include payload values.</div>
              </div>
              <div>
                <label className="block font-body text-xs theme-text-muted mb-1">Who should see this notification?</label>
                <select
                  value={String(a.config.recipientType ?? "admin")}
                  onChange={(e) => updateConfig(i, "recipientType", e.target.value)}
                  className="w-full rounded px-3 py-2 font-body text-sm theme-input"
                >
                  <option value="admin">All admins (bell icon)</option>
                  <option value="partner">The partner tied to this event</option>
                </select>
              </div>
            </>
          )}

          {a.type === "deal.note" && (
            <div>
              <label className="block font-body text-xs theme-text-muted mb-1">Note content</label>
              <textarea
                placeholder="e.g. Auto-note: client responded to initial outreach"
                value={String(a.config.content ?? "")}
                onChange={(e) => updateConfig(i, "content", e.target.value)}
                rows={2}
                className="w-full rounded px-3 py-2 font-body text-sm theme-input resize-none"
              />
              <div className="mt-1 font-body text-[11px] theme-text-faint">Supports <code className="font-mono">{"{deal.field}"}</code> tokens.</div>
            </div>
          )}

          {a.type === "email.send" && (() => {
            const mode = String(a.config.recipientMode ?? (defaults?.emailToken && a.config.recipientEmail === defaults.emailToken ? "matching" : "custom"));
            const hasDefault = !!defaults?.emailToken;
            return (
              <>
                <div>
                  <label className="block font-body text-xs theme-text-muted mb-1">Which email template?</label>
                  <EmailTemplatePicker
                    value={String(a.config.template ?? "")}
                    onChange={(v) => updateConfig(i, "template", v)}
                  />
                </div>
                <div>
                  <label className="block font-body text-xs theme-text-muted mb-2">Who should receive it?</label>
                  {hasDefault && (
                    <label className="flex items-start gap-2 mb-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={mode === "matching"}
                        onChange={() => {
                          updateConfig(i, "recipientMode", "matching");
                          updateConfig(i, "recipientEmail", defaults!.emailToken);
                        }}
                        className="mt-0.5"
                      />
                      <span className="font-body text-sm theme-text-secondary">
                        {defaults!.emailLabel}
                      </span>
                    </label>
                  )}
                  <label className="flex items-start gap-2 mb-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!hasDefault || mode === "custom"}
                      onChange={() => updateConfig(i, "recipientMode", "custom")}
                      className="mt-0.5"
                    />
                    <span className="font-body text-sm theme-text-secondary">Someone else</span>
                  </label>
                  {(!hasDefault || mode === "custom") && (
                    <input
                      placeholder="e.g. admin@fintella.partners or {deal.clientEmail}"
                      value={String(a.config.recipientEmail ?? "")}
                      onChange={(e) => updateConfig(i, "recipientEmail", e.target.value)}
                      className="w-full mt-1 rounded px-3 py-2 font-body text-sm theme-input"
                    />
                  )}
                </div>
              </>
            );
          })()}

          {a.type === "sms.send" && (() => {
            const mode = String(a.config.recipientMode ?? (a.config.partnerCode === "deal_partner" ? "matching" : a.config.partnerCode ? "custom" : "matching"));
            const hasDefault = !!defaults?.smsSubject;
            return (
              <>
                <div>
                  <label className="block font-body text-xs theme-text-muted mb-1">Which SMS template?</label>
                  <input
                    placeholder="e.g. agreement_reminder"
                    value={String(a.config.template ?? "")}
                    onChange={(e) => updateConfig(i, "template", e.target.value)}
                    className="w-full rounded px-3 py-2 font-body text-sm theme-input font-mono"
                  />
                  <div className="mt-1 font-body text-[11px] theme-text-faint">Template <code className="font-mono">key</code> from /admin/communications → SMS Templates. Must be enabled + partner opted-in (TCPA).</div>
                </div>
                <div>
                  <label className="block font-body text-xs theme-text-muted mb-2">Who should receive it?</label>
                  {hasDefault && (
                    <label className="flex items-start gap-2 mb-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={mode === "matching"}
                        onChange={() => {
                          updateConfig(i, "recipientMode", "matching");
                          updateConfig(i, "partnerCode", "deal_partner");
                        }}
                        className="mt-0.5"
                      />
                      <span className="font-body text-sm theme-text-secondary">{defaults!.smsLabel}</span>
                    </label>
                  )}
                  <label className="flex items-start gap-2 mb-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!hasDefault || mode === "custom"}
                      onChange={() => updateConfig(i, "recipientMode", "custom")}
                      className="mt-0.5"
                    />
                    <span className="font-body text-sm theme-text-secondary">A specific partner code</span>
                  </label>
                  {(!hasDefault || mode === "custom") && (
                    <input
                      placeholder="e.g. PTNJD8K3F"
                      value={String(a.config.partnerCode === "deal_partner" ? "" : a.config.partnerCode ?? "")}
                      onChange={(e) => updateConfig(i, "partnerCode", e.target.value)}
                      className="w-full mt-1 rounded px-3 py-2 font-body text-sm theme-input font-mono"
                    />
                  )}
                </div>
              </>
            );
          })()}
        </div>
        );
      })}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => addAction("email.send")}
          className="text-sm font-body px-3 py-2 rounded transition-colors hover:opacity-80 flex items-center gap-1.5"
          style={{ border: "1px solid var(--brand-gold)", color: "var(--brand-gold)", background: "rgba(196,160,80,0.05)" }}
        >
          + Add action
        </button>
        <select
          value=""
          onChange={(e) => { if (e.target.value) addAction(e.target.value as ActionType); }}
          className="rounded px-2 py-2 font-body text-xs theme-input"
          aria-label="Quick add specific action type"
        >
          <option value="">Quick add…</option>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>{ACTION_DISPLAY[t].icon} {ACTION_DISPLAY[t].label}</option>
          ))}
        </select>
      </div>

      {/* Advanced: variable reference chips collapsed until needed */}
      <VariableReference trigger={trigger} />
    </div>
  );
}

// ─── Workflow form slide-in ───────────────────────────────────────────────────

function WorkflowPanel({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Workflow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [trigger, setTrigger] = useState<TriggerKey>(
    (initial?.trigger as TriggerKey) ?? "deal.created"
  );
  const [stageFilter, setStageFilter] = useState(
    (initial?.triggerConfig as any)?.stage ?? ""
  );
  // Cadence (in days) — only surfaced for scheduled reminder triggers.
  // Stored on triggerConfig.cadenceDays. Defaults to 7.
  const [cadenceDays, setCadenceDays] = useState<string>(
    String((initial?.triggerConfig as any)?.cadenceDays ?? 7)
  );
  // Lead time (in hours) — only for conference.call_reminder. Stored on
  // triggerConfig.hoursBeforeCall. Defaults to 24.
  const [hoursBeforeCall, setHoursBeforeCall] = useState<string>(
    String((initial?.triggerConfig as any)?.hoursBeforeCall ?? 24)
  );
  const [conditions, setConditions] = useState<Condition[]>(
    Array.isArray(initial?.conditions)
      ? (initial.conditions as Condition[])
      : []
  );
  const [actions, setActions] = useState<ActionConfig[]>(
    Array.isArray(initial?.actions)
      ? (initial.actions as ActionConfig[])
      : []
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Name is required"); return; }
    if (actions.length === 0) { setErr("Add at least one action"); return; }

    setSaving(true);
    setErr("");

    const body = {
      name: name.trim(),
      description: description.trim() || null,
      trigger,
      triggerConfig:
        trigger === "deal.stage_changed" && stageFilter
          ? { stage: stageFilter }
          : trigger === "partner.agreement_reminder" || trigger === "partner.invite_reminder"
            ? { cadenceDays: Math.max(1, Number(cadenceDays) || 7) }
            : trigger === "conference.call_reminder"
              ? { hoursBeforeCall: Math.max(1, Number(hoursBeforeCall) || 24) }
              : null,
      conditions: conditions.length ? conditions : null,
      actions,
      enabled,
    };

    const url = initial ? `/api/admin/workflows/${initial.id}` : "/api/admin/workflows";
    const method = initial ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      onSaved();
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed to save");
    }
    setSaving(false);
  }

  const [advancedOpen, setAdvancedOpen] = useState(conditions.length > 0);
  const isScheduled = trigger === "partner.agreement_reminder" || trigger === "partner.invite_reminder";
  const isConferenceReminder = trigger === "conference.call_reminder";

  // Live "What will this workflow do?" summary — regenerates as the admin
  // changes fields, so they don't have to mentally assemble what they're
  // about to save.
  const summary = (() => {
    const parts: string[] = [];
    const whenWord = isScheduled
      ? `every ${Math.max(1, Number(cadenceDays) || 7)} day${Number(cadenceDays) === 1 ? "" : "s"}`
      : isConferenceReminder
        ? `${Math.max(1, Number(hoursBeforeCall) || 24)} hour${Number(hoursBeforeCall) === 1 ? "" : "s"} before each Live Weekly call`
        : `when ${TRIGGER_LABELS[trigger].toLowerCase()}`;
    parts.push(`**When:** ${whenWord}`);

    if (actions.length === 0) {
      parts.push("**Do:** _no actions yet_");
    } else {
      const verbs = actions.map((a) => {
        if (a.type === "email.send") return `send an email${a.config.template ? ` (${String(a.config.template)})` : ""}`;
        if (a.type === "sms.send") return `send an SMS${a.config.template ? ` (${String(a.config.template)})` : ""}`;
        if (a.type === "notification.create") return "create a bell notification";
        if (a.type === "deal.note") return "append a note to the deal";
        if (a.type === "webhook.post") return "POST to a webhook URL";
        return a.type;
      });
      parts.push(`**Do:** ${verbs.join(" + ")}`);
    }
    if (conditions.length > 0) {
      parts.push(`**Only if:** ${conditions.length} filter${conditions.length > 1 ? "s" : ""} match`);
    }
    return parts.join(" · ");
  })();

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full overflow-y-auto flex flex-col" style={{ background: "var(--app-bg)", borderLeft: "1px solid var(--app-border)" }}>
        <div className="flex items-center justify-between p-5 sticky top-0 z-10" style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
          <h2 className="font-display text-lg font-bold">{initial ? "Edit Workflow" : "New Workflow"}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-gold/10 transition-colors theme-text-muted">✕</button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* ── Live summary card ─────────────────────────────────────── */}
          <div className="rounded-lg p-3" style={{ border: "1px solid var(--brand-gold)", background: "rgba(196,160,80,0.05)" }}>
            <div className="font-body text-[10px] uppercase tracking-[1.5px] text-brand-gold/80 mb-1.5">What this workflow does</div>
            <div
              className="font-body text-[13px] theme-text-secondary leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: summary.replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--app-text)]">$1</strong>'),
              }}
            />
          </div>

          {/* ── Basics ────────────────────────────────────────────────── */}
          <div>
            <label className="block font-body text-xs theme-text-muted mb-1">Give this workflow a name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Partner Agreement Reminder" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
          </div>

          {/* ── STEP 1 — When should this run? ───────────────────────── */}
          <div className="rounded-lg p-4 space-y-3" style={{ border: "1px solid var(--app-border)" }}>
            <div className="flex items-center gap-2">
              <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-brand-gold/15 border border-brand-gold/40 font-body text-[11px] font-bold text-brand-gold">1</span>
              <div className="font-body text-sm font-semibold">When should this run?</div>
            </div>
            <div>
              <label className="block font-body text-xs theme-text-muted mb-1">Trigger *</label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as TriggerKey)}
                className="w-full rounded px-3 py-2 font-body text-sm theme-input"
              >
                {TRIGGER_KEYS.map((k) => (
                  <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>
                ))}
              </select>
              <div className="mt-1 font-body text-[11px] theme-text-faint leading-snug">
                {TRIGGER_DESCRIPTIONS[trigger as TriggerKey]}
              </div>
            </div>

            {trigger === "deal.stage_changed" && (
              <div>
                <label className="block font-body text-xs theme-text-muted mb-1">Only when the new stage is</label>
                <input
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  placeholder="e.g. closedwon  (leave blank to fire for every stage change)"
                  className="w-full rounded px-3 py-2 font-body text-sm theme-input"
                />
              </div>
            )}

            {isScheduled && (() => {
              const presetOptions = [1, 3, 7, 14, 30];
              const currentNum = Number(cadenceDays) || 7;
              const isPreset = presetOptions.includes(currentNum);
              return (
                <div>
                  <label className="block font-body text-xs theme-text-muted mb-1">How often should the reminder go out? *</label>
                  <div className="flex gap-2">
                    <select
                      value={isPreset ? String(currentNum) : "custom"}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setCadenceDays(String(currentNum));
                        } else {
                          setCadenceDays(e.target.value);
                        }
                      }}
                      className="flex-1 rounded px-3 py-2 font-body text-sm theme-input"
                    >
                      <option value="1">Every day</option>
                      <option value="3">Every 3 days</option>
                      <option value="7">Every week (7 days)</option>
                      <option value="14">Every 2 weeks (14 days)</option>
                      <option value="30">Every month (30 days)</option>
                      <option value="custom">Custom…</option>
                    </select>
                    {!isPreset && (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={cadenceDays}
                        onChange={(e) => setCadenceDays(e.target.value)}
                        className="w-24 rounded px-3 py-2 font-body text-sm theme-input"
                        placeholder="days"
                      />
                    )}
                  </div>
                  <div className="mt-1 font-body text-[11px] theme-text-faint leading-snug">
                    Runs once a day (15:00 UTC). Each matching {trigger === "partner.agreement_reminder" ? "unsigned agreement" : "unused invite"} gets one reminder per period.
                  </div>
                </div>
              );
            })()}

            {isConferenceReminder && (() => {
              const presetOptions = [1, 2, 6, 12, 24, 48];
              const currentNum = Number(hoursBeforeCall) || 24;
              const isPreset = presetOptions.includes(currentNum);
              return (
                <div>
                  <label className="block font-body text-xs theme-text-muted mb-1">How far in advance should the reminder go out? *</label>
                  <div className="flex gap-2">
                    <select
                      value={isPreset ? String(currentNum) : "custom"}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setHoursBeforeCall(String(currentNum));
                        } else {
                          setHoursBeforeCall(e.target.value);
                        }
                      }}
                      className="flex-1 rounded px-3 py-2 font-body text-sm theme-input"
                    >
                      <option value="1">1 hour before the call</option>
                      <option value="2">2 hours before</option>
                      <option value="6">6 hours before</option>
                      <option value="12">12 hours before</option>
                      <option value="24">1 day before (24 hours)</option>
                      <option value="48">2 days before (48 hours)</option>
                      <option value="custom">Custom…</option>
                    </select>
                    {!isPreset && (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={hoursBeforeCall}
                        onChange={(e) => setHoursBeforeCall(e.target.value)}
                        className="w-24 rounded px-3 py-2 font-body text-sm theme-input"
                        placeholder="hours"
                      />
                    )}
                  </div>
                  <div className="mt-1 font-body text-[11px] theme-text-faint leading-snug">
                    Runs hourly. Each active Live Weekly call triggers this workflow once per active partner when the lead-time window opens.
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── STEP 2 — What should it do? ──────────────────────────── */}
          <div className="rounded-lg p-4 space-y-3" style={{ border: "1px solid var(--app-border)" }}>
            <div className="flex items-center gap-2">
              <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-brand-gold/15 border border-brand-gold/40 font-body text-[11px] font-bold text-brand-gold">2</span>
              <div className="font-body text-sm font-semibold">What should happen?</div>
            </div>
            <ActionEditor actions={actions} onChange={setActions} trigger={trigger} />
          </div>

          {/* ── Advanced (collapsed) ──────────────────────────────────── */}
          <div className="rounded-lg" style={{ border: "1px solid var(--app-border)" }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 font-body text-sm theme-text-secondary hover:text-brand-gold transition-colors"
            >
              <span>{advancedOpen ? "▾" : "▸"} Advanced — notes + filters</span>
              {conditions.length > 0 && (
                <span className="font-body text-[11px] text-brand-gold">{conditions.length} filter{conditions.length > 1 ? "s" : ""}</span>
              )}
            </button>
            {advancedOpen && (
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <label className="block font-body text-xs theme-text-muted mb-1">Internal note (admins only)</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why does this workflow exist?" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
                </div>

                <div>
                  <label className="block font-body text-xs theme-text-muted mb-2">Only continue if ALL of these filters match</label>
                  <div className="space-y-2">
                    {conditions.map((c, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <input
                          placeholder="field (e.g. deal.stage)"
                          value={c.field}
                          onChange={(e) => {
                            const next = [...conditions];
                            next[i] = { ...next[i], field: e.target.value };
                            setConditions(next);
                          }}
                          className="flex-1 rounded px-2 py-1.5 font-body text-xs theme-input font-mono"
                          title="Dot-notation path into the trigger payload. Use the variable chips at the bottom of Step 2 to copy exact field names."
                        />
                        <select
                          value={c.op}
                          onChange={(e) => {
                            const next = [...conditions];
                            next[i] = { ...next[i], op: e.target.value as Condition["op"] };
                            setConditions(next);
                          }}
                          className="rounded px-2 py-1.5 font-body text-xs theme-input"
                        >
                          {OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                        </select>
                        {c.op !== "exists" && c.op !== "not_exists" && (
                          <input
                            placeholder="value"
                            value={c.value}
                            onChange={(e) => {
                              const next = [...conditions];
                              next[i] = { ...next[i], value: e.target.value };
                              setConditions(next);
                            }}
                            className="w-24 rounded px-2 py-1.5 font-body text-xs theme-input"
                          />
                        )}
                        <button onClick={() => setConditions(conditions.filter((_, idx) => idx !== i))} className="text-red-400 text-sm px-1" title="Remove filter">✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => setConditions([...conditions, { field: "", op: "eq", value: "" }])}
                      className="text-xs font-body px-2 py-1 rounded transition-colors hover:opacity-80 theme-text-muted"
                      style={{ border: "1px solid var(--app-border)" }}
                    >
                      + Add filter
                    </button>
                  </div>
                  <div className="mt-2 font-body text-[11px] theme-text-faint leading-snug">
                    Filters narrow when the workflow fires. Use <strong>is known</strong> / <strong>is unknown</strong> to check whether a field has a value — e.g. <code className="font-mono">agreement.signedDate</code> <em>is unknown</em> means the agreement has not been signed yet.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Enable ────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="wf-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="wf-enabled" className="font-body text-sm theme-text-secondary">Enable this workflow</label>
          </div>

          {err && <p className="font-body text-xs text-red-400">{err}</p>}
        </div>

        <div className="p-5 flex gap-3" style={{ borderTop: "1px solid var(--app-border)" }}>
          <button onClick={onClose} className="flex-1 py-2 rounded font-body text-sm theme-text-secondary transition-colors hover:opacity-80" style={{ border: "1px solid var(--app-border)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2 rounded font-body text-sm font-medium transition-colors disabled:opacity-50" style={{ background: "var(--brand-gold)", color: "#000" }}>
            {saving ? "Saving…" : "Save Workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WebhookSource form slide-in ──────────────────────────────────────────────

function SourcePanel({
  initial,
  onClose,
  onSaved,
}: {
  initial?: WebhookSource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [actions, setActions] = useState<ActionConfig[]>(
    Array.isArray(initial?.actions) ? (initial.actions as ActionConfig[]) : []
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Auto-generate slug from name
  function handleNameChange(v: string) {
    setName(v);
    if (!initial) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  }

  async function save() {
    if (!name.trim()) { setErr("Name is required"); return; }
    if (!slug.trim()) { setErr("Slug is required"); return; }
    if (!initial && actions.length === 0) { setErr("Add at least one action"); return; }

    setSaving(true);
    setErr("");

    const body = initial
      ? { name: name.trim(), description: description.trim() || null, actions, enabled }
      : { name: name.trim(), slug: slug.trim(), description: description.trim() || null, actions, enabled };

    const url = initial ? `/api/admin/webhook-sources/${initial.id}` : "/api/admin/webhook-sources";
    const method = initial ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      onSaved();
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed to save");
    }
    setSaving(false);
  }

  const endpointUrl = `https://fintella.partners/api/webhook/${slug || "<slug>"}`;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full overflow-y-auto flex flex-col" style={{ background: "var(--app-bg)", borderLeft: "1px solid var(--app-border)" }}>
        <div className="flex items-center justify-between p-5 sticky top-0 z-10" style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
          <h2 className="font-display text-lg font-bold">{initial ? "Edit Source" : "New Webhook Source"}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-gold/10 transition-colors theme-text-muted">✕</button>
        </div>

        <div className="p-5 space-y-4 flex-1">
          <div>
            <label className="block font-body text-xs theme-text-muted mb-1">Name *</label>
            <input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Salesforce Events" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
          </div>

          {!initial && (
            <div>
              <label className="block font-body text-xs theme-text-muted mb-1">Slug *</label>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="salesforce-events" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
              <p className="font-body text-[11px] theme-text-muted mt-1">POST endpoint: <code className="text-brand-gold">{endpointUrl}</code></p>
            </div>
          )}

          {initial && (
            <div className="rounded-lg p-3 space-y-2" style={{ border: "1px solid var(--app-border)", background: "var(--app-bg-secondary)" }}>
              <p className="font-body text-xs theme-text-muted">POST endpoint</p>
              <code className="font-body text-xs text-brand-gold break-all">{endpointUrl}</code>
              <p className="font-body text-xs theme-text-muted mt-2">API Key (send as <code>x-api-key</code> header)</p>
              <code className="font-body text-xs theme-text-secondary break-all">{initial.apiKey}</code>
            </div>
          )}

          <div>
            <label className="block font-body text-xs theme-text-muted mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
          </div>

          <div>
            <label className="block font-body text-xs theme-text-muted mb-2">Actions (on incoming request)</label>
            {/* WebhookSource has no Fintella trigger; payload shape is arbitrary, so
                no variable reference is rendered. */}
            <ActionEditor actions={actions} onChange={setActions} trigger={null} />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="src-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="src-enabled" className="font-body text-sm theme-text-secondary">Enabled</label>
          </div>

          {err && <p className="font-body text-xs text-red-400">{err}</p>}
        </div>

        <div className="p-5 flex gap-3" style={{ borderTop: "1px solid var(--app-border)" }}>
          <button onClick={onClose} className="flex-1 py-2 rounded font-body text-sm theme-text-secondary transition-colors hover:opacity-80" style={{ border: "1px solid var(--app-border)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2 rounded font-body text-sm font-medium transition-colors disabled:opacity-50" style={{ background: "var(--brand-gold)", color: "#000" }}>
            {saving ? "Saving…" : "Save Source"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "#22c55e",
    failed: "#ef4444",
    skipped: "#f59e0b",
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-body text-xs font-medium" style={{ background: `${colors[status] || "#888"}22`, color: colors[status] || "#888", border: `1px solid ${colors[status] || "#888"}44` }}>
      {status}
    </span>
  );
}

// ─── Automations tab ──────────────────────────────────────────────────────────

function AutomationsTab() {
  const { columnWidths: autoCols, getResizeHandler: autoResize } = useResizableColumns([200, 150, 150, 150, 80, 80], { storageKey: "workflows" });
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Workflow | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/workflows");
    if (res.ok) {
      const j = await res.json();
      setWorkflows(j.workflows || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleEnabled(wf: Workflow) {
    await fetch(`/api/admin/workflows/${wf.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !wf.enabled }),
    });
    load();
  }

  async function deleteWorkflow(wf: Workflow) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    await fetch(`/api/admin/workflows/${wf.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-sm theme-text-muted">{workflows.length} automation{workflows.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => { setEditTarget(undefined); setPanelOpen(true); }}
          className="font-body text-sm px-4 py-2 rounded-lg transition-colors font-medium"
          style={{ background: "var(--brand-gold)", color: "#000" }}
        >
          + New Automation
        </button>
      </div>

      {loading ? (
        <p className="font-body text-sm theme-text-muted">Loading…</p>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: "1px solid var(--app-border)" }}>
          <p className="font-body text-sm theme-text-muted mb-1">No automations yet</p>
          <p className="font-body text-xs theme-text-muted">Create one to fire actions when events happen in Fintella</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--app-border)" }}>
          <table className="w-full" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th className="font-body text-[11px] theme-text-muted uppercase tracking-wide text-center px-4 py-3" style={{ width: autoCols[0], position: "relative" }}>Name<span {...autoResize(0)} /></th>
                <th className="font-body text-[11px] theme-text-muted uppercase tracking-wide text-center px-4 py-3" style={{ width: autoCols[1], position: "relative" }}>Trigger<span {...autoResize(1)} /></th>
                <th className="font-body text-[11px] theme-text-muted uppercase tracking-wide text-center px-4 py-3" style={{ width: autoCols[2], position: "relative" }}>Actions<span {...autoResize(2)} /></th>
                <th className="font-body text-[11px] theme-text-muted uppercase tracking-wide text-center px-4 py-3" style={{ width: autoCols[3], position: "relative" }}>Last Run<span {...autoResize(3)} /></th>
                <th className="font-body text-[11px] theme-text-muted uppercase tracking-wide text-center px-4 py-3" style={{ width: autoCols[4], position: "relative" }}>Enabled<span {...autoResize(4)} /></th>
                <th className="font-body text-[11px] theme-text-muted uppercase tracking-wide text-center px-4 py-3" style={{ width: autoCols[5], position: "relative" }}><span {...autoResize(5)} /></th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => {
                const lastLog = wf.logs?.[0];
                return (
                  <tr key={wf.id} style={{ borderBottom: "1px solid var(--app-border)" }} className="hover:bg-brand-gold/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-body text-sm font-medium">{wf.name}</div>
                      {wf.description && <div className="font-body text-xs theme-text-muted">{wf.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "var(--brand-gold-muted, rgba(212,175,55,0.12))", color: "var(--brand-gold)" }}>
                        {wf.trigger}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-sm theme-text-secondary">
                      {Array.isArray(wf.actions) ? wf.actions.length : 0}
                    </td>
                    <td className="px-4 py-3">
                      {lastLog ? (
                        <div>
                          <StatusBadge status={lastLog.status} />
                          <div className="font-body text-[11px] theme-text-muted mt-0.5">
                            {new Date(lastLog.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <span className="font-body text-xs theme-text-muted">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleEnabled(wf)}
                        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${wf.enabled ? "bg-green-500" : "bg-gray-500"}`}
                      >
                        <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${wf.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditTarget(wf); setPanelOpen(true); }}
                          className="font-body text-xs px-2 py-1 rounded theme-text-muted hover:text-brand-gold transition-colors"
                          style={{ border: "1px solid var(--app-border)" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteWorkflow(wf)}
                          className="font-body text-xs px-2 py-1 rounded text-red-400 hover:text-red-300 transition-colors"
                          style={{ border: "1px solid var(--app-border)" }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {panelOpen && (
        <WorkflowPanel
          initial={editTarget}
          onClose={() => setPanelOpen(false)}
          onSaved={() => { setPanelOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Incoming Sources tab ─────────────────────────────────────────────────────

function SourcesTab() {
  const [sources, setSources] = useState<WebhookSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WebhookSource | undefined>();
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/webhook-sources");
    if (res.ok) {
      const j = await res.json();
      setSources(j.sources || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleEnabled(src: WebhookSource) {
    await fetch(`/api/admin/webhook-sources/${src.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !src.enabled }),
    });
    load();
  }

  async function deleteSource(src: WebhookSource) {
    if (!confirm(`Delete "${src.name}"?`)) return;
    await fetch(`/api/admin/webhook-sources/${src.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-sm theme-text-muted">{sources.length} incoming source{sources.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => { setEditTarget(undefined); setPanelOpen(true); }}
          className="font-body text-sm px-4 py-2 rounded-lg transition-colors font-medium"
          style={{ background: "var(--brand-gold)", color: "#000" }}
        >
          + New Source
        </button>
      </div>

      {loading ? (
        <p className="font-body text-sm theme-text-muted">Loading…</p>
      ) : sources.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: "1px solid var(--app-border)" }}>
          <p className="font-body text-sm theme-text-muted mb-1">No incoming sources yet</p>
          <p className="font-body text-xs theme-text-muted">Configure a named endpoint to receive POSTs from external systems</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((src) => (
            <div key={src.id} className="rounded-xl p-4" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-body text-sm font-medium">{src.name}</div>
                  {src.description && <div className="font-body text-xs theme-text-muted">{src.description}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleEnabled(src)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${src.enabled ? "bg-green-500" : "bg-gray-500"}`}
                  >
                    <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${src.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <button
                    onClick={() => { setEditTarget(src); setPanelOpen(true); }}
                    className="font-body text-xs px-2 py-1 rounded theme-text-muted hover:text-brand-gold transition-colors"
                    style={{ border: "1px solid var(--app-border)" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteSource(src)}
                    className="font-body text-xs px-2 py-1 rounded text-red-400 hover:text-red-300 transition-colors"
                    style={{ border: "1px solid var(--app-border)" }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-body">
                <div className="rounded p-2" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
                  <p className="theme-text-muted mb-0.5">POST endpoint</p>
                  <code className="text-brand-gold break-all">https://fintella.partners/api/webhook/{src.slug}</code>
                </div>
                <div className="rounded p-2" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="theme-text-muted">x-api-key</p>
                    <button
                      onClick={() => setRevealedKeys((prev) => {
                        const next = new Set(prev);
                        next.has(src.id) ? next.delete(src.id) : next.add(src.id);
                        return next;
                      })}
                      className="theme-text-muted hover:text-brand-gold transition-colors"
                    >
                      {revealedKeys.has(src.id) ? "hide" : "reveal"}
                    </button>
                  </div>
                  <code className="theme-text-secondary break-all">
                    {revealedKeys.has(src.id) ? src.apiKey : "••••••••••••••••••••"}
                  </code>
                </div>
              </div>

              <div className="flex gap-4 mt-2 font-body text-xs theme-text-muted">
                <span>Requests: {src.requestCount}</span>
                {src.lastHitAt && <span>Last hit: {new Date(src.lastHitAt).toLocaleString()}</span>}
                <span>Actions: {Array.isArray(src.actions) ? src.actions.length : 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {panelOpen && (
        <SourcePanel
          initial={editTarget}
          onClose={() => setPanelOpen(false)}
          onSaved={() => { setPanelOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Execution Log tab ────────────────────────────────────────────────────────

function LogTab() {
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/workflows/logs");
    if (res.ok) {
      const j = await res.json();
      setLogs(j.logs || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-sm theme-text-muted">Last {logs.length} executions</p>
        <button onClick={load} className="font-body text-xs px-3 py-1.5 rounded transition-colors theme-text-muted hover:text-brand-gold" style={{ border: "1px solid var(--app-border)" }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="font-body text-sm theme-text-muted">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: "1px solid var(--app-border)" }}>
          <p className="font-body text-sm theme-text-muted">No executions yet</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          {logs.map((log) => (
            <div key={log.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
              <button
                className="w-full text-left px-4 py-3 hover:bg-brand-gold/5 transition-colors"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusBadge status={log.status} />
                  <span className="font-body text-sm font-medium">
                    {log.workflow?.name || "Unknown workflow"}
                  </span>
                  <span className="font-mono text-xs theme-text-muted">{log.triggerKey}</span>
                  {log.durationMs != null && (
                    <span className="font-body text-xs theme-text-muted">{log.durationMs}ms</span>
                  )}
                  <span className="font-body text-xs theme-text-muted ml-auto">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                {log.error && (
                  <p className="font-body text-xs text-red-400 mt-1">{log.error}</p>
                )}
              </button>

              {expandedId === log.id && (
                <div className="px-4 pb-4 space-y-3">
                  {!!log.actionsRun && (
                    <div>
                      <p className="font-body text-xs theme-text-muted mb-1">Actions run</p>
                      <pre className="font-mono text-xs rounded p-3 overflow-x-auto theme-text-secondary" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
                        {JSON.stringify(log.actionsRun, null, 2)}
                      </pre>
                    </div>
                  )}
                  {!!log.triggerData && (
                    <div>
                      <p className="font-body text-xs theme-text-muted mb-1">Trigger payload (truncated)</p>
                      <pre className="font-mono text-xs rounded p-3 overflow-x-auto theme-text-secondary max-h-48" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
                        {JSON.stringify(log.triggerData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "automations" | "sources" | "logs";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "automations", label: "Automations", icon: "⚡" },
  { id: "sources", label: "Incoming Sources", icon: "📥" },
  { id: "logs", label: "Execution Log", icon: "📋" },
];

export default function WorkflowsPanel() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";
  const [tab, setTab] = useState<Tab>("automations");
  const [showHelp, setShowHelp] = useState(false);

  // Non-super_admin fallback — the /api/admin/workflows* routes already 403
  // these roles; this keeps the UI honest instead of showing them a broken
  // configure-anything surface.
  if (!isSuperAdmin) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="font-display text-2xl font-bold mb-1">Workflows &amp; Automations</h2>
          <p className="font-body text-sm theme-text-muted">
            Super admins only.
          </p>
        </div>
        <div className="card p-6 max-w-2xl">
          <div className="font-body text-sm text-[var(--app-text-secondary)] leading-relaxed">
            Automations are restricted to the <strong>super_admin</strong> role because
            they can fire emails, notifications, and outbound HTTP requests on behalf of
            the firm. If you need an automation configured, ask a super admin.
          </div>
          <div className="font-body text-sm text-[var(--app-text-secondary)] leading-relaxed mt-3">
            If you're looking to edit an existing email template, head to{" "}
            <strong>Communications → Email → Templates</strong> instead — that surface is
            available to all admin roles.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold mb-1">Workflows &amp; Automations</h2>
          <p className="font-body text-sm theme-text-muted">
            Trigger actions automatically based on Fintella events, or configure incoming webhook endpoints.
          </p>
        </div>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="font-body text-xs px-3 py-1.5 rounded-lg border border-[var(--app-border)] theme-text-muted hover:theme-text-secondary transition-colors shrink-0"
        >
          {showHelp ? "Hide help" : "How it works"}
        </button>
      </div>

      {/* How it works — collapsible */}
      {showHelp && (
        <div className="mb-6 p-4 rounded-xl bg-brand-gold/[0.04] border border-brand-gold/20 text-sm font-body text-[var(--app-text-secondary)] leading-relaxed space-y-3">
          <div>
            <strong className="text-brand-gold">Automations</strong> fire when something happens in Fintella.
            Pick a <em>trigger</em> (e.g., a deal moves to Closed Won), optionally add <em>conditions</em>
            {" "}(e.g., only if the refund is over $100K), and one or more <em>actions</em> (email, deal note,
            notification, webhook POST). Variables like <code className="text-brand-gold">{"{deal.dealName}"}</code>
            {" "}in action text are replaced with real values at fire time.
          </div>
          <div>
            <strong className="text-brand-gold">Incoming Sources</strong> are the reverse: external systems POST
            to a Fintella URL (<code>/api/webhook/&lt;slug&gt;</code>) and trigger actions here.
          </div>
          <div className="p-3 rounded-lg bg-[var(--app-input-bg)] border border-[var(--app-border)]">
            <strong className="text-[var(--app-text)]">Lifecycle emails are separate.</strong> The 8 built-in
            email templates (welcome, agreement signed, deal status update, commission paid, password reset, etc.)
            are already fired automatically by hardcoded lifecycle code paths — they do <em>not</em> need an
            Automation row. Use Automations for <em>additional</em> custom flows on top of those. To edit built-in
            template copy, go to Communications → Email → Templates.
          </div>
          <div>
            <strong className="text-brand-gold">Variable syntax:</strong> condition <code>field</code> paths use
            dot notation (<code>deal.stage</code>). Action text and email body variables use{" "}
            <code>{"{path}"}</code> or <code>{"{{path}}"}</code>. Available variables depend on the selected
            trigger — expand the "Show available variables" panel inside an automation editor.
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-body text-sm transition-all ${
              tab === t.id
                ? "font-medium shadow-sm"
                : "theme-text-muted hover:opacity-80"
            }`}
            style={
              tab === t.id
                ? { background: "var(--app-bg)", color: "var(--brand-gold)", border: "1px solid var(--app-border)" }
                : {}
            }
          >
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "automations" && <AutomationsTab />}
      {tab === "sources" && <SourcesTab />}
      {tab === "logs" && <LogTab />}
    </div>
  );
}
