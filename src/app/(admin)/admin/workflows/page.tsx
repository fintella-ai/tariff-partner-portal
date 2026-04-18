"use client";

import { useState, useEffect, useCallback } from "react";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import {
  TRIGGER_KEYS,
  TRIGGER_LABELS,
  ACTION_TYPES,
  ACTION_LABELS,
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
  config: Record<string, string>;
}

// ─── Condition editor helpers ─────────────────────────────────────────────────

const OPS = ["eq", "neq", "gt", "lt", "contains", "exists"] as const;

interface Condition {
  field: string;
  op: typeof OPS[number];
  value: string;
}

// ─── Action editor ─────────────────────────────────────────────────────────────

function ActionEditor({
  actions,
  onChange,
}: {
  actions: ActionConfig[];
  onChange: (a: ActionConfig[]) => void;
}) {
  function addAction() {
    onChange([...actions, { type: "webhook.post", config: { url: "" } }]);
  }
  function removeAction(i: number) {
    onChange(actions.filter((_, idx) => idx !== i));
  }
  function updateType(i: number, type: ActionType) {
    const next = [...actions];
    next[i] = { type, config: {} };
    onChange(next);
  }
  function updateConfig(i: number, key: string, val: string) {
    const next = [...actions];
    next[i] = { ...next[i], config: { ...next[i].config, [key]: val } };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {actions.map((a, i) => (
        <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: "1px solid var(--app-border)", background: "var(--app-bg-secondary)" }}>
          <div className="flex items-center gap-2">
            <select
              value={a.type}
              onChange={(e) => updateType(i, e.target.value as ActionType)}
              className="flex-1 rounded px-2 py-1.5 font-body text-sm theme-input"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>{ACTION_LABELS[t]}</option>
              ))}
            </select>
            <button
              onClick={() => removeAction(i)}
              className="text-red-500 hover:text-red-400 text-sm px-2 py-1 rounded transition-colors"
              style={{ border: "1px solid var(--app-border)" }}
            >
              Remove
            </button>
          </div>

          {a.type === "webhook.post" && (
            <>
              <input
                placeholder="URL (required)"
                value={a.config.url || ""}
                onChange={(e) => updateConfig(i, "url", e.target.value)}
                className="w-full rounded px-2 py-1.5 font-body text-sm theme-input"
              />
            </>
          )}

          {a.type === "notification.create" && (
            <>
              <input
                placeholder="Title"
                value={a.config.title || ""}
                onChange={(e) => updateConfig(i, "title", e.target.value)}
                className="w-full rounded px-2 py-1.5 font-body text-sm theme-input"
              />
              <textarea
                placeholder="Message (supports {deal.dealName} variables)"
                value={a.config.message || ""}
                onChange={(e) => updateConfig(i, "message", e.target.value)}
                rows={2}
                className="w-full rounded px-2 py-1.5 font-body text-sm theme-input resize-none"
              />
              <select
                value={a.config.recipientType || "admin"}
                onChange={(e) => updateConfig(i, "recipientType", e.target.value)}
                className="w-full rounded px-2 py-1.5 font-body text-sm theme-input"
              >
                <option value="admin">Admin</option>
                <option value="partner">Partner (from payload)</option>
              </select>
            </>
          )}

          {a.type === "deal.note" && (
            <textarea
              placeholder="Note content (supports {deal.dealName} variables)"
              value={a.config.content || ""}
              onChange={(e) => updateConfig(i, "content", e.target.value)}
              rows={2}
              className="w-full rounded px-2 py-1.5 font-body text-sm theme-input resize-none"
            />
          )}

          {a.type === "email.send" && (
            <>
              <input
                placeholder="Email template key (e.g. commission_paid)"
                value={a.config.template || ""}
                onChange={(e) => updateConfig(i, "template", e.target.value)}
                className="w-full rounded px-2 py-1.5 font-body text-sm theme-input"
              />
              <input
                placeholder="Recipient email"
                value={a.config.recipientEmail || ""}
                onChange={(e) => updateConfig(i, "recipientEmail", e.target.value)}
                className="w-full rounded px-2 py-1.5 font-body text-sm theme-input"
              />
            </>
          )}
        </div>
      ))}
      <button
        onClick={addAction}
        className="text-sm font-body px-3 py-1.5 rounded transition-colors hover:opacity-80"
        style={{ border: "1px solid var(--app-border)", color: "var(--brand-gold)" }}
      >
        + Add Action
      </button>
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
      triggerConfig: trigger === "deal.stage_changed" && stageFilter ? { stage: stageFilter } : null,
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

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full overflow-y-auto flex flex-col" style={{ background: "var(--app-bg)", borderLeft: "1px solid var(--app-border)" }}>
        <div className="flex items-center justify-between p-5 sticky top-0 z-10" style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
          <h2 className="font-display text-lg font-bold">{initial ? "Edit Workflow" : "New Workflow"}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-gold/10 transition-colors theme-text-muted">✕</button>
        </div>

        <div className="p-5 space-y-4 flex-1">
          <div>
            <label className="block font-body text-xs theme-text-muted mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Notify admin on deal created" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
          </div>

          <div>
            <label className="block font-body text-xs theme-text-muted mb-1">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
          </div>

          <div>
            <label className="block font-body text-xs theme-text-muted mb-1">Trigger *</label>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerKey)} className="w-full rounded px-3 py-2 font-body text-sm theme-input">
              {TRIGGER_KEYS.map((k) => (
                <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>
              ))}
            </select>
          </div>

          {trigger === "deal.stage_changed" && (
            <div>
              <label className="block font-body text-xs theme-text-muted mb-1">Only when stage is (optional)</label>
              <input value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} placeholder="e.g. closedwon" className="w-full rounded px-3 py-2 font-body text-sm theme-input" />
            </div>
          )}

          <div>
            <label className="block font-body text-xs theme-text-muted mb-2">Conditions (all must match)</label>
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
                    className="flex-1 rounded px-2 py-1.5 font-body text-xs theme-input"
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
                    {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {c.op !== "exists" && (
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
                  <button onClick={() => setConditions(conditions.filter((_, idx) => idx !== i))} className="text-red-400 text-sm px-1">✕</button>
                </div>
              ))}
              <button
                onClick={() => setConditions([...conditions, { field: "", op: "eq", value: "" }])}
                className="text-xs font-body px-2 py-1 rounded transition-colors hover:opacity-80 theme-text-muted"
                style={{ border: "1px solid var(--app-border)" }}
              >
                + Add Condition
              </button>
            </div>
          </div>

          <div>
            <label className="block font-body text-xs theme-text-muted mb-2">Actions *</label>
            <ActionEditor actions={actions} onChange={setActions} />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="wf-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="wf-enabled" className="font-body text-sm theme-text-secondary">Enabled</label>
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
            <ActionEditor actions={actions} onChange={setActions} />
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
  const { columnWidths: autoCols, getResizeHandler: autoResize } = useResizableColumns([200, 150, 150, 150, 80, 80]);
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

export default function WorkflowsPage() {
  const [tab, setTab] = useState<Tab>("automations");

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold mb-1">Workflows & Automations</h2>
        <p className="font-body text-sm theme-text-muted">
          Trigger actions automatically based on Fintella events, or configure incoming webhook endpoints.
        </p>
      </div>

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
