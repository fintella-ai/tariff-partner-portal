"use client";

import { useState, useEffect, useCallback } from "react";
import { fmtDate } from "@/lib/format";

// ─── TYPE ──────────────────────────────────────────────────────────────────

type ConferenceEntry = {
  id: string;
  title: string;
  description: string | null;
  embedUrl: string | null;
  joinUrl: string | null;
  recordingUrl: string | null;
  schedule: string | null;
  nextCall: string | null;
  hostName: string | null;
  duration: string | null;
  weekNumber: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// ─── DEMO FALLBACK ────────────────────────────────────────────────────────

const DEMO_ENTRIES: ConferenceEntry[] = [
  { id: "d1", title: "Weekly Partner Training & Q&A", description: "Product updates, training topics, success stories, and live Q&A.", embedUrl: null, joinUrl: "https://zoom.us/j/1234567890", recordingUrl: null, schedule: "Every Thursday at 2:00 PM ET", nextCall: "2026-03-26T18:00:00Z", hostName: "TRRLN Leadership Team", duration: null, weekNumber: 13, notes: null, isActive: true, createdAt: "2026-03-20", updatedAt: "2026-03-20" },
  { id: "d2", title: "Section 301 Update & New Partner Tools", description: null, embedUrl: "https://youtube.com/embed/example", joinUrl: null, recordingUrl: null, schedule: null, nextCall: "2026-03-19T18:00:00Z", hostName: "Sarah Mitchell", duration: "52 min", weekNumber: 12, notes: "Key topics covered.", isActive: false, createdAt: "2026-03-19", updatedAt: "2026-03-19" },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────

export default function AdminConferencePage() {
  const [entries, setEntries] = useState<ConferenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ConferenceEntry | null>(null);

  // Form fields
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formHostName, setFormHostName] = useState("");
  const [formWeekNumber, setFormWeekNumber] = useState("");
  const [formJoinUrl, setFormJoinUrl] = useState("");
  const [formEmbedUrl, setFormEmbedUrl] = useState("");
  const [formRecordingUrl, setFormRecordingUrl] = useState("");
  const [formSchedule, setFormSchedule] = useState("");
  const [formNextCall, setFormNextCall] = useState("");
  const [formDuration, setFormDuration] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/conference");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries(data.entries?.length ? data.entries : DEMO_ENTRIES);
    } catch {
      setEntries(DEMO_ENTRIES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // ── Form helpers ───────────────────────────────────────────────────────

  const resetForm = () => {
    setFormTitle(""); setFormDescription(""); setFormHostName("");
    setFormWeekNumber(""); setFormJoinUrl(""); setFormEmbedUrl("");
    setFormRecordingUrl(""); setFormSchedule(""); setFormNextCall("");
    setFormDuration(""); setFormNotes(""); setFormIsActive(true);
    setEditingItem(null); setShowForm(false);
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (entry: ConferenceEntry) => {
    setEditingItem(entry);
    setFormTitle(entry.title);
    setFormDescription(entry.description || "");
    setFormHostName(entry.hostName || "");
    setFormWeekNumber(entry.weekNumber?.toString() || "");
    setFormJoinUrl(entry.joinUrl || "");
    setFormEmbedUrl(entry.embedUrl || "");
    setFormRecordingUrl(entry.recordingUrl || "");
    setFormSchedule(entry.schedule || "");
    setFormNextCall(entry.nextCall ? new Date(entry.nextCall).toISOString().slice(0, 16) : "");
    setFormDuration(entry.duration || "");
    setFormNotes(entry.notes || "");
    setFormIsActive(entry.isActive);
    setShowForm(true);
  };

  // ── CRUD ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formTitle.trim()) return;

    const body = {
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      hostName: formHostName.trim() || null,
      weekNumber: formWeekNumber ? parseInt(formWeekNumber, 10) : null,
      joinUrl: formJoinUrl.trim() || null,
      embedUrl: formEmbedUrl.trim() || null,
      recordingUrl: formRecordingUrl.trim() || null,
      schedule: formSchedule.trim() || null,
      nextCall: formNextCall || null,
      duration: formDuration.trim() || null,
      notes: formNotes.trim() || null,
      isActive: formIsActive,
    };

    try {
      if (editingItem) {
        await fetch(`/api/admin/conference/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/admin/conference", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      fetchEntries();
    } catch {
      // silently fail — data will remain unchanged
    }
  };

  const handleToggleActive = async (entry: ConferenceEntry) => {
    try {
      await fetch(`/api/admin/conference/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      fetchEntries();
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (entry: ConferenceEntry) => {
    if (!confirm(`Delete "${entry.title}"?`)) return;
    try {
      await fetch(`/api/admin/conference/${entry.id}`, { method: "DELETE" });
      fetchEntries();
    } catch {
      // silently fail
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalEntries = entries.length;
  const activeCount = entries.filter((e) => e.isActive).length;
  const pastCount = entries.filter((e) => !e.isActive).length;
  const withNotes = entries.filter((e) => e.notes).length;

  const stats = [
    { label: "Total Entries", value: totalEntries, color: "text-white" },
    { label: "Active / Upcoming", value: activeCount, color: "text-green-400" },
    { label: "Past Recordings", value: pastCount, color: "text-blue-400" },
    { label: "With Notes", value: withNotes, color: "text-amber-400" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-white/40">Loading conference data...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold">Live Weekly Management</h2>
          <p className="font-body text-[13px] text-white/40 mt-1">
            Manage weekly call schedule, recordings, and meeting notes.
          </p>
        </div>
        <button onClick={openAddForm} className="btn-gold text-[12px] px-4 py-2.5">
          + Add Entry
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="card p-4 sm:p-5">
            <div className="font-body text-[11px] text-white/30 uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card p-5 sm:p-6 mb-6">
          <div className="font-body font-semibold text-sm mb-4">
            {editingItem ? "Edit Entry" : "Add New Entry"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Title */}
            <div className="sm:col-span-2">
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="Weekly Partner Training & Q&A"
              />
            </div>
            {/* Description */}
            <div className="sm:col-span-2">
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors resize-none"
                placeholder="Brief description of this entry"
              />
            </div>
            {/* Host Name */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Host Name</label>
              <input
                type="text"
                value={formHostName}
                onChange={(e) => setFormHostName(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="TRRLN Leadership Team"
              />
            </div>
            {/* Week Number */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Week Number</label>
              <input
                type="number"
                value={formWeekNumber}
                onChange={(e) => setFormWeekNumber(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="13"
              />
            </div>
            {/* Join URL */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Join URL (Zoom/Meet)</label>
              <input
                type="text"
                value={formJoinUrl}
                onChange={(e) => setFormJoinUrl(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="https://zoom.us/j/..."
              />
            </div>
            {/* Embed URL */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Embed URL (YouTube/Vimeo)</label>
              <input
                type="text"
                value={formEmbedUrl}
                onChange={(e) => setFormEmbedUrl(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="https://www.youtube.com/embed/..."
              />
            </div>
            {/* Recording URL */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Recording URL (External)</label>
              <input
                type="text"
                value={formRecordingUrl}
                onChange={(e) => setFormRecordingUrl(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="https://zoom.us/rec/share/..."
              />
            </div>
            {/* Schedule */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Schedule</label>
              <input
                type="text"
                value={formSchedule}
                onChange={(e) => setFormSchedule(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="Every Thursday at 2:00 PM ET"
              />
            </div>
            {/* Next Call Date */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Call Date</label>
              <input
                type="datetime-local"
                value={formNextCall}
                onChange={(e) => setFormNextCall(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
              />
            </div>
            {/* Duration */}
            <div>
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Duration</label>
              <input
                type="text"
                value={formDuration}
                onChange={(e) => setFormDuration(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="52 min"
              />
            </div>
            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider block mb-1">Notes (Markdown)</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={6}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 font-body text-[13px] text-white/80 focus:border-brand-gold/40 focus:outline-none transition-colors resize-none"
                placeholder="**Key Topics:**&#10;- Topic 1&#10;- Topic 2&#10;&#10;**Action Items:**&#10;- Item 1"
              />
            </div>
            {/* Active toggle */}
            <div className="sm:col-span-2 flex items-center gap-3">
              <label className="font-body text-[11px] text-white/40 uppercase tracking-wider">Active</label>
              <button
                type="button"
                onClick={() => setFormIsActive(!formIsActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formIsActive ? "bg-green-500" : "bg-white/10"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formIsActive ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="font-body text-[12px] text-white/50">{formIsActive ? "Active (upcoming)" : "Inactive (past recording)"}</span>
            </div>
          </div>
          {/* Form actions */}
          <div className="flex gap-3 mt-5">
            <button onClick={handleSave} className="btn-gold text-[12px] px-5 py-2.5">
              {editingItem ? "Save Changes" : "Create Entry"}
            </button>
            <button onClick={resetForm} className="font-body text-[12px] text-white/40 border border-white/10 rounded-lg px-5 py-2.5 hover:text-white/60 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ═══ TABLE (desktop) ═══ */}
      <div className="card hidden sm:block">
        {/* Table header */}
        <div className="grid grid-cols-[60px_1fr_140px_100px_80px_70px_70px_80px_120px] gap-2 px-5 py-3 border-b border-white/[0.06]">
          {["Wk #", "Title", "Host", "Date", "Duration", "Rec?", "Notes?", "Status", "Actions"].map((h) => (
            <div key={h} className="font-body text-[11px] text-white/30 uppercase tracking-wider">{h}</div>
          ))}
        </div>
        {/* Table rows */}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-[60px_1fr_140px_100px_80px_70px_70px_80px_120px] gap-2 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors items-center"
          >
            <div className="font-body text-[13px] text-white/60">{entry.weekNumber || "—"}</div>
            <div className="font-body text-[13px] text-white/80 truncate">{entry.title}</div>
            <div className="font-body text-[12px] text-white/50 truncate">{entry.hostName || "—"}</div>
            <div className="font-body text-[12px] text-white/50">{fmtDate(entry.nextCall)}</div>
            <div className="font-body text-[12px] text-white/50">{entry.duration || "—"}</div>
            <div className="font-body text-[12px]">{entry.embedUrl || entry.recordingUrl ? "✓" : "—"}</div>
            <div className="font-body text-[12px]">{entry.notes ? "✓" : "—"}</div>
            <div>
              <span className={`inline-block rounded-full px-2.5 py-1 font-body text-[10px] font-semibold tracking-wider uppercase ${entry.isActive ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                {entry.isActive ? "Active" : "Past"}
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => openEditForm(entry)}
                className="font-body text-[10px] text-brand-gold/60 border border-brand-gold/20 rounded px-2 py-1 hover:bg-brand-gold/10 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleToggleActive(entry)}
                className="font-body text-[10px] text-white/40 border border-white/10 rounded px-2 py-1 hover:bg-white/[0.04] transition-colors"
              >
                {entry.isActive ? "Archive" : "Activate"}
              </button>
              <button
                onClick={() => handleDelete(entry)}
                className="font-body text-[10px] text-red-400/60 border border-red-400/20 rounded px-2 py-1 hover:bg-red-400/10 transition-colors"
              >
                Del
              </button>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="px-5 py-10 text-center">
            <div className="font-body text-[13px] text-white/30">No conference entries yet.</div>
          </div>
        )}
      </div>

      {/* ═══ MOBILE CARDS ═══ */}
      <div className="sm:hidden space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-body text-[13px] text-white/80 font-medium truncate">
                  {entry.weekNumber ? `Wk ${entry.weekNumber} — ` : ""}{entry.title}
                </div>
                <div className="font-body text-[11px] text-white/30 mt-0.5">
                  {fmtDate(entry.nextCall)} · {entry.duration || "—"}{entry.hostName ? ` · ${entry.hostName}` : ""}
                </div>
              </div>
              <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${entry.isActive ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                {entry.isActive ? "Active" : "Past"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-white/30 mb-3">
              <span>Rec: {entry.embedUrl || entry.recordingUrl ? "✓" : "—"}</span>
              <span>Notes: {entry.notes ? "✓" : "—"}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => openEditForm(entry)}
                className="font-body text-[11px] text-brand-gold/60 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleToggleActive(entry)}
                className="font-body text-[11px] text-white/40 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/[0.04] transition-colors"
              >
                {entry.isActive ? "Archive" : "Activate"}
              </button>
              <button
                onClick={() => handleDelete(entry)}
                className="font-body text-[11px] text-red-400/60 border border-red-400/20 rounded-lg px-3 py-1.5 hover:bg-red-400/10 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
