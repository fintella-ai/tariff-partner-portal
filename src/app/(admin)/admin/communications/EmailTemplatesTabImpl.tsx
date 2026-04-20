"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stashComposePrefill } from "./EmailComposeTabImpl";
import { categoryOptions, categoryBadge, type Template } from "./_shared";

/**
 * Templates section of the Communications hub. Owns:
 *   - live template list (fetched from /api/admin/email-templates)
 *   - create form (draft-only — new templates never fire until wired
 *     in a future PR)
 *   - inline edit modal with full CRUD
 *   - Live / Drafts sub-tabs
 *
 * The "Use" button previously did `setActiveTab("Compose")` on the
 * internal pill bar. After the April 2026 host-rewrite we stash the
 * prefill in sessionStorage and route to `?tab=email&view=compose`.
 */
export default function EmailTemplatesTabImpl() {
  const router = useRouter();

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
    loadTemplates();
  }, [loadTemplates]);

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

  // "Use" button — switch to the Compose view and pre-fill subject + body
  // with the template's content (un-interpolated, so the admin can manually
  // tweak before sending). Variable placeholders like {firstName} stay as-is
  // for the admin to replace.
  const handleUseTemplate = (t: Template) => {
    stashComposePrefill({ subject: t.subject, body: t.bodyText });
    router.push("/admin/communications?tab=email&view=compose");
  };

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

      {/* Edit template modal */}
      {editingTpl && <EditTemplateModal
        t={editingTpl}
        saving={editSaving}
        error={editError}
        onChange={(next) => setEditingTpl(next)}
        onCancel={() => !editSaving && setEditingTpl(null)}
        onSave={handleSaveEdit}
      />}
    </>
  );
}

function EditTemplateModal({
  t,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  t: Template;
  saving: boolean;
  error: string | null;
  onChange: (next: Template) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
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
        if (e.target === e.currentTarget && !saving) onCancel();
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
            onClick={onCancel}
            disabled={saving}
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
                  onChange={(e) => onChange({ ...t, name: e.target.value })}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                />
              </div>
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">Category</label>
                <select
                  value={t.category}
                  onChange={(e) => onChange({ ...t, category: e.target.value })}
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
                onChange={(e) => onChange({ ...t, subject: e.target.value })}
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
                onChange={(e) => onChange({ ...t, preheader: e.target.value || null })}
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
                onChange={(e) => onChange({ ...t, heading: e.target.value })}
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
                onChange={(e) => onChange({ ...t, bodyHtml: e.target.value })}
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
                onChange={(e) => onChange({ ...t, bodyText: e.target.value })}
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
                  onChange={(e) => onChange({ ...t, ctaLabel: e.target.value || null })}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                />
              </div>
              <div>
                <label className="block text-[var(--app-text-muted)] text-xs mb-1">CTA URL</label>
                <input
                  type="text"
                  value={t.ctaUrl || ""}
                  onChange={(e) => onChange({ ...t, ctaUrl: e.target.value || null })}
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
                    onChange={(e) => onChange({ ...t, fromEmail: e.target.value || null })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">From Name</label>
                  <input
                    type="text"
                    placeholder="Fintella"
                    value={t.fromName || ""}
                    onChange={(e) => onChange({ ...t, fromName: e.target.value || null })}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-3 py-2 text-sm text-[var(--app-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--app-text-muted)] text-xs mb-1">Reply-To</label>
                  <input
                    type="email"
                    placeholder="support@fintella.partners"
                    value={t.replyTo || ""}
                    onChange={(e) => onChange({ ...t, replyTo: e.target.value || null })}
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
                onChange={(e) => onChange({ ...t, enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="tpl-enabled" className="text-xs text-[var(--app-text-secondary)]">
                <span className="font-semibold">Enabled</span> — when unchecked, this template is skipped at send time and the hardcoded fallback in <code className="font-mono text-[10px]">src/lib/sendgrid.ts</code> is used instead.
              </label>
            </div>

            {error && (
              <div className="text-xs text-red-400 py-2 px-3 rounded border border-red-400/20 bg-red-400/5">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Modal footer */}
        <div className="px-6 py-4 border-t border-[var(--app-border)] flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-sm px-4 py-2 rounded font-body text-[var(--app-text-muted)] border border-[var(--app-border)] hover:text-[var(--app-text-secondary)] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="text-sm px-5 py-2 rounded font-body font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
