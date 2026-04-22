"use client";

import { useCallback, useEffect, useState } from "react";

type SmsTemplate = {
  id: string;
  key: string;
  name: string;
  category: string;
  body: string;
  enabled: boolean;
  isDraft: boolean;
  description: string | null;
  variables: string | null;
  createdAt: string;
  updatedAt: string;
};

const categoryOptions = ["Onboarding", "Deal Updates", "Commissions", "Company Updates", "Promotions", "Recruitment", "Opt-In"];

const categoryBadge: Record<string, string> = {
  Onboarding: "bg-blue-500/20 text-blue-400",
  "Deal Updates": "bg-purple-500/20 text-purple-400",
  Commissions: "bg-green-500/20 text-green-400",
  "Company Updates": "bg-orange-500/20 text-orange-400",
  Promotions: "bg-pink-500/20 text-pink-400",
  Recruitment: "bg-indigo-500/20 text-indigo-400",
  "Opt-In": "bg-yellow-500/20 text-yellow-400",
};

const SMS_COMPOSE_PREFILL_KEY = "comms.sms.compose.prefill";

/** Stash a template body for the SMS Compose tab to consume on mount. */
export function stashSmsComposePrefill(prefill: { body: string; templateKey?: string }) {
  try {
    sessionStorage.setItem(SMS_COMPOSE_PREFILL_KEY, JSON.stringify(prefill));
  } catch {}
}

/**
 * SMS → Templates sub-tab. Mirrors EmailTemplatesTabImpl:
 *   - Live / Disabled / Drafts sub-pill tabs with counts
 *   - Category filter chips (All + dynamic chips per category present)
 *   - 2-column card grid with Use / Edit / Delete buttons
 *   - Create Template form (starts as disabled draft)
 *
 * Seeded rows (welcome / agreement_ready / agreement_signed /
 * signup_notification / opt_in_request) land disabled while Twilio A2P
 * 10DLC approval is pending. Hardcoded bodies in src/lib/twilio.ts are
 * the live fallback until a row is enabled here.
 */
export default function SmsTemplatesTabImpl() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(categoryOptions[0]);
  const [newBody, setNewBody] = useState("");
  const [newSaving, setNewSaving] = useState(false);

  const [subTab, setSubTab] = useState<"live" | "disabled" | "drafts">("disabled");
  const [category, setCategory] = useState<string>("all");

  const [editingTpl, setEditingTpl] = useState<SmsTemplate | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sms-templates");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load SMS templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function handleCreate() {
    if (!newKey.trim() || !newName.trim() || !newBody.trim()) {
      alert("Key, name, and body are required.");
      return;
    }
    setNewSaving(true);
    try {
      const res = await fetch("/api/admin/sms-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
          name: newName.trim(),
          category: newCategory,
          body: newBody.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to create template");
        return;
      }
      setNewKey(""); setNewName(""); setNewCategory(categoryOptions[0]); setNewBody("");
      setShowNewTemplate(false);
      await loadTemplates();
    } finally {
      setNewSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingTpl) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/sms-templates/${editingTpl.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingTpl.name,
          category: editingTpl.category,
          body: editingTpl.body,
          description: editingTpl.description,
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
  }

  async function handleDelete(t: SmsTemplate) {
    if (!confirm(`Delete SMS template "${t.name}"? Seeded templates will be re-created on the next deploy.`)) return;
    const res = await fetch(`/api/admin/sms-templates/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || `HTTP ${res.status}`);
      return;
    }
    await loadTemplates();
  }

  async function toggleEnabled(t: SmsTemplate) {
    if (!t.enabled) {
      if (!confirm(
        `Enable the "${t.name}" SMS template?\n\n` +
        `Once enabled, any send using the "${t.key}" key will use this body instead of the hardcoded fallback. ` +
        `Only enable after Twilio A2P 10DLC approval — until then every send goes to demo mode regardless.`
      )) return;
    }
    await fetch(`/api/admin/sms-templates/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    await loadTemplates();
  }

  function handleUseTemplate(t: SmsTemplate) {
    stashSmsComposePrefill({ body: t.body, templateKey: t.key });
    // Signal the parent SmsTabImpl to switch to the compose sub-view.
    window.dispatchEvent(new CustomEvent("sms:go-to-compose"));
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display text-lg font-bold">SMS Templates</h3>
          <p className="font-body text-xs text-[var(--app-text-muted)] mt-1">
            Edit any template to change what gets sent. Hardcoded bodies in <span className="font-mono">src/lib/twilio.ts</span> remain the fallback until a template is enabled here.
          </p>
        </div>
        <button
          onClick={() => setShowNewTemplate(!showNewTemplate)}
          className="text-sm px-4 py-1.5 rounded bg-brand-gold text-black font-medium hover:bg-brand-gold/90 transition"
        >
          {showNewTemplate ? "Cancel" : "Create Template"}
        </button>
      </div>

      <div className="p-3 mb-5 rounded-lg bg-yellow-500/[0.05] border border-yellow-500/20">
        <p className="font-body text-[12px] text-yellow-300 leading-relaxed">
          <strong>All templates are disabled pending Twilio A2P 10DLC approval.</strong> Flip <em>Enable</em> per-template after the campaign clears TCR — until then every send goes to demo mode regardless of whether a template row is enabled.
        </p>
      </div>

      {showNewTemplate && (
        <div className="card p-5 mb-6">
          <h4 className="font-display text-sm font-bold mb-4">New Template (Draft)</h4>
          <p className="font-body text-xs text-[var(--app-text-muted)] mb-4">
            Custom templates start as drafts, disabled by default. Wire them to a code path (or use them for bulk sends) once enabled.
          </p>
          <div className="flex flex-col gap-4 font-body text-sm">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Template Name</label>
                <input
                  type="text"
                  placeholder="e.g. Deal Closed SMS"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50"
                />
              </div>
              <div className="sm:w-64">
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Key (lowercase, underscores)</label>
                <input
                  type="text"
                  placeholder="deal_closed"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 font-mono text-xs"
                />
              </div>
              <div className="sm:w-48">
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] focus:outline-none focus:border-brand-gold/50"
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c} className="bg-[var(--app-popover-bg)] text-[var(--app-text)]">{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[var(--app-text-muted)] text-xs mb-1">Body (plain text — keep under ~140 chars for single segment)</label>
              <textarea
                placeholder="Template body... supports {variables} like {firstName}"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                className="w-full min-h-[80px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-brand-gold/50 resize-y"
                maxLength={320}
              />
              <div className="text-[10px] text-[var(--app-text-muted)] mt-1">{newBody.length}/320 chars</div>
            </div>
            <button
              onClick={handleCreate}
              disabled={newSaving}
              className="self-start px-5 py-2 rounded font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-50"
            >
              {newSaving ? "Saving..." : "Save Template"}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="font-body text-sm text-[var(--app-text-muted)] py-8 text-center">Loading templates...</div>
      )}
      {error && (
        <div className="font-body text-sm text-red-400 py-4 px-3 mb-4 rounded border border-red-400/20 bg-red-400/5">{error}</div>
      )}

      {/* Live / Disabled / Drafts sub-tabs */}
      {!loading && (
        <div className="flex gap-1 mb-3 border-b border-[var(--app-border)]">
          {(["live", "disabled", "drafts"] as const).map((sub) => {
            const count =
              sub === "live"    ? templates.filter((t) => !t.isDraft && t.enabled).length :
              sub === "disabled" ? templates.filter((t) => !t.isDraft && !t.enabled).length :
                                   templates.filter((t) => t.isDraft).length;
            const label = sub === "live" ? "Live" : sub === "disabled" ? "Disabled" : "Drafts";
            return (
              <button
                key={sub}
                onClick={() => { setSubTab(sub); setCategory("all"); }}
                className={`font-body text-[13px] px-4 py-2.5 transition-colors border-b-2 -mb-px ${
                  subTab === sub
                    ? "text-brand-gold border-brand-gold"
                    : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
                }`}
              >
                {label} <span className="text-[10px] text-[var(--app-text-faint)]">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Category filter chips */}
      {!loading && (() => {
        const statusFiltered = templates.filter((t) =>
          subTab === "live" ? !t.isDraft && t.enabled :
          subTab === "disabled" ? !t.isDraft && !t.enabled :
          t.isDraft
        );
        const categories = Array.from(new Set(statusFiltered.map((t) => t.category).filter(Boolean))).sort();
        if (categories.length === 0) return null;
        return (
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setCategory("all")}
              className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                category === "all"
                  ? "bg-brand-gold/15 text-brand-gold border-brand-gold/40"
                  : "text-[var(--app-text-muted)] border-[var(--app-border)] hover:text-[var(--app-text-secondary)]"
              }`}
            >
              All <span className="text-[10px] opacity-70">({statusFiltered.length})</span>
            </button>
            {categories.map((cat) => {
              const count = statusFiltered.filter((t) => t.category === cat).length;
              const active = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-brand-gold/15 text-brand-gold border-brand-gold/40"
                      : "text-[var(--app-text-muted)] border-[var(--app-border)] hover:text-[var(--app-text-secondary)]"
                  }`}
                >
                  {cat} <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Template cards — 2-col grid */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {templates
            .filter((t) =>
              subTab === "live" ? !t.isDraft && t.enabled :
              subTab === "disabled" ? !t.isDraft && !t.enabled :
              t.isDraft
            )
            .filter((t) => category === "all" || t.category === category)
            .map((t) => (
              <div key={t.id} className="card p-5">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-display text-sm font-bold">{t.name}</h4>
                      {t.isDraft ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          title="Draft — not wired to any code path. Editing has no effect on real partner SMS until wired."
                        >
                          Draft
                        </span>
                      ) : t.enabled ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-lime-500/15 text-lime-400 border border-lime-500/30"
                          title="Live — send helpers prefer this body over the hardcoded fallback."
                        >
                          Live
                        </span>
                      ) : (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30"
                          title="Disabled — send helpers use the hardcoded fallback instead. Enable after Twilio A2P is approved."
                        >
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--app-text-faint)] mt-0.5">key: {t.key}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      categoryBadge[t.category] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                    }`}
                  >
                    {t.category}
                  </span>
                </div>
                {t.description && (
                  <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-2 italic">{t.description}</p>
                )}
                <p className="font-body text-xs text-[var(--app-text-muted)] line-clamp-3 mb-3 whitespace-pre-wrap">
                  {t.body}
                </p>
                {t.variables && (() => {
                  try {
                    const vars: string[] = JSON.parse(t.variables);
                    if (!Array.isArray(vars) || vars.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {vars.map((v) => (
                          <span key={v} className="font-mono text-[10px] px-2 py-0.5 rounded bg-[var(--app-input-bg)] border border-[var(--app-border)] text-[var(--app-text-secondary)]">
                            {`{${v}}`}
                          </span>
                        ))}
                      </div>
                    );
                  } catch { return null; }
                })()}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => handleUseTemplate(t)}
                    className="text-xs px-3 py-1 rounded bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
                    title="Pre-fill the Compose tab with this template's body"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => toggleEnabled(t)}
                    className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition"
                  >
                    {t.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => { setEditError(null); setEditingTpl({ ...t }); }}
                    className="text-xs px-3 py-1 rounded bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="text-xs px-3 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          {templates.length === 0 && !loading && !error && (
            <div className="font-body text-sm text-[var(--app-text-muted)] py-8 text-center col-span-full">
              No SMS templates yet. Click <strong>Create Template</strong> or wait for the next deploy to seed the defaults.
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editingTpl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4">
          <div className="w-full max-w-2xl bg-[var(--app-popover-bg)] border border-[var(--app-border)] rounded-xl p-6 mt-10">
            <div className="flex items-start justify-between mb-4">
              <h4 className="font-display text-lg font-bold">Edit SMS Template</h4>
              <button onClick={() => setEditingTpl(null)} className="text-[var(--app-text-muted)] hover:text-[var(--app-text)]" aria-label="Close">✕</button>
            </div>
            <div className="flex flex-col gap-4 font-body text-sm">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Name</label>
                  <input
                    value={editingTpl.name}
                    onChange={(e) => setEditingTpl({ ...editingTpl, name: e.target.value })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)]"
                  />
                </div>
                <div className="sm:w-48">
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Category</label>
                  <select
                    value={editingTpl.category}
                    onChange={(e) => setEditingTpl({ ...editingTpl, category: e.target.value })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)]"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c} className="bg-[var(--app-popover-bg)] text-[var(--app-text)]">{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Description (optional)</label>
                <input
                  value={editingTpl.description || ""}
                  onChange={(e) => setEditingTpl({ ...editingTpl, description: e.target.value })}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)]"
                />
              </div>
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Body</label>
                <textarea
                  value={editingTpl.body}
                  onChange={(e) => setEditingTpl({ ...editingTpl, body: e.target.value })}
                  className="w-full min-h-[120px] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-[var(--app-text)] font-mono text-[12px] resize-y"
                  maxLength={320}
                />
                <div className="text-[10px] text-[var(--app-text-muted)] mt-1">{editingTpl.body.length}/320 chars</div>
              </div>
              <div className="font-mono text-[11px] text-[var(--app-text-faint)]">key: {editingTpl.key} (not editable)</div>
              {editError && (
                <div className="text-xs px-3 py-2 rounded border bg-red-500/10 text-red-400 border-red-500/20">{editError}</div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingTpl(null)}
                  className="text-sm px-4 py-2 rounded border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="text-sm px-4 py-2 rounded bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-50"
                >
                  {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
