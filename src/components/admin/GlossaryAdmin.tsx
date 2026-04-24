"use client";

import { useCallback, useEffect, useState } from "react";

interface GlossaryEntry {
  id: string;
  term: string;
  aliases: string[];
  definition: string;
  category: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  id: string | null; // null = creating, non-null = editing
  term: string;
  aliasesRaw: string; // comma-separated in the form
  definition: string;
  category: string;
  sortOrder: number;
  published: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  term: "",
  aliasesRaw: "",
  definition: "",
  category: "",
  sortOrder: 0,
  published: true,
};

/**
 * Admin CRUD panel for TrainingGlossary. Mounted under the Glossary tab on
 * /admin/training. Minimal UX: list + inline form. Full polish (drag-reorder,
 * bulk actions, CSV import) is deferred to Phase 2d polish chunk.
 */
export default function GlossaryAdmin() {
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchEntries = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/training/glossary");
      if (!res.ok) throw new Error("Failed to load glossary");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load glossary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(entry: GlossaryEntry) {
    setForm({
      id: entry.id,
      term: entry.term,
      aliasesRaw: (entry.aliases ?? []).join(", "),
      definition: entry.definition,
      category: entry.category ?? "",
      sortOrder: entry.sortOrder,
      published: entry.published,
    });
    setShowForm(true);
  }

  function cancel() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function save() {
    if (!form.term.trim() || !form.definition.trim()) {
      setError("Term and definition are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        term: form.term.trim(),
        aliases: form.aliasesRaw
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        definition: form.definition,
        category: form.category.trim() || null,
        sortOrder: form.sortOrder,
        published: form.published,
      };
      const res = await fetch(
        form.id
          ? `/api/admin/training/glossary/${form.id}`
          : "/api/admin/training/glossary",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      await fetchEntries();
      cancel();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: GlossaryEntry) {
    if (!confirm(`Delete glossary entry "${entry.term}"?`)) return;
    try {
      const res = await fetch(`/api/admin/training/glossary/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      await fetchEntries();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete");
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? entries.filter((e) => {
        const inTerm = e.term.toLowerCase().includes(q);
        const inAlias = (e.aliases ?? []).some((a) => a.toLowerCase().includes(q));
        const inDef = e.definition.toLowerCase().includes(q);
        const inCat = (e.category ?? "").toLowerCase().includes(q);
        return inTerm || inAlias || inDef || inCat;
      })
    : entries;

  const stats = {
    total: entries.length,
    published: entries.filter((e) => e.published).length,
    categories: new Set(entries.map((e) => e.category).filter(Boolean)).size,
  };

  return (
    <div>
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Terms", value: stats.total },
          { label: "Published", value: stats.published },
          { label: "Categories", value: stats.categories },
        ].map((s) => (
          <div key={s.label} className="card p-4 sm:p-5">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">
              {s.label}
            </div>
            <div className="font-display text-xl font-bold text-brand-gold">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 font-body text-[12px]">
          {error}
        </div>
      )}

      {/* Search + Add */}
      {!showForm && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search terms, aliases, definitions, category…"
            className="flex-1 bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-4 py-2.5 font-body text-sm text-[var(--app-text)] outline-none focus:border-brand-gold/40"
          />
          <button
            onClick={openCreate}
            className="btn-gold font-body text-sm px-4 py-2.5 rounded-lg whitespace-nowrap"
          >
            + Add Term
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card p-4 sm:p-6 mb-6">
          <h3 className="font-display text-base font-bold mb-4">
            {form.id ? "Edit Glossary Term" : "Add New Glossary Term"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                Term
              </label>
              <input
                type="text"
                value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value })}
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                placeholder="e.g. IEEPA, Section 301, Liquidation Window"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                Aliases (comma-separated)
              </label>
              <input
                type="text"
                value={form.aliasesRaw}
                onChange={(e) =>
                  setForm({ ...form, aliasesRaw: e.target.value })
                }
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                placeholder="e.g. IEEPA, International Emergency Economic Powers Act"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                Definition (markdown, 1-3 sentences)
              </label>
              <textarea
                value={form.definition}
                onChange={(e) =>
                  setForm({ ...form, definition: e.target.value })
                }
                rows={4}
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                placeholder="Plain-English definition. Tara will cite this verbatim when a partner asks what the term means."
              />
            </div>
            <div>
              <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                Category (optional)
              </label>
              <input
                type="text"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                placeholder="legal, tariff_types, process, …"
              />
            </div>
            <div>
              <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                Sort order
              </label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })
                }
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) =>
                    setForm({ ...form, published: e.target.checked })
                  }
                  className="accent-brand-gold w-4 h-4"
                />
                <span className="font-body text-[13px] text-[var(--app-text)]">
                  Published (visible to partners + included in Tara&apos;s
                  knowledge base)
                </span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="btn-gold font-body text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {saving ? "Saving…" : form.id ? "Save changes" : "Create term"}
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              className="font-body text-sm px-4 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="font-body text-[13px] text-[var(--app-text-muted)] italic">
          Loading glossary…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="font-body text-[13px] text-[var(--app-text-muted)]">
            {q
              ? `No terms match "${search}".`
              : "No glossary entries yet. Click + Add Term to create the first."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((e) => (
            <div
              key={e.id}
              className="card p-4 flex flex-col gap-2"
            >
              <div className="flex items-start gap-2 flex-wrap">
                <div className="font-display text-base font-bold text-[var(--app-text)] flex-1">
                  {e.term}
                </div>
                {!e.published && (
                  <span className="font-body text-[10px] uppercase tracking-wider bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded px-2 py-0.5">
                    Draft
                  </span>
                )}
                {e.category && (
                  <span className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-2 py-0.5">
                    {e.category}
                  </span>
                )}
              </div>
              {e.aliases && e.aliases.length > 0 && (
                <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                  aka: {e.aliases.join(", ")}
                </div>
              )}
              <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-relaxed whitespace-pre-wrap">
                {e.definition}
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => openEdit(e)}
                  className="font-body text-[11px] uppercase tracking-wider px-3 py-1.5 border border-[var(--app-border)] rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(e)}
                  className="font-body text-[11px] uppercase tracking-wider px-3 py-1.5 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
