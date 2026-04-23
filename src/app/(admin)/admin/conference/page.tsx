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
  jitsiRoom?: string | null;
  googleCalendarEventId?: string | null;
  googleCalendarHtmlLink?: string | null;
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────

/**
 * Compress + resize an image file to a base64 data URL.
 * Mirrors the helper on /admin/settings so the banner upload here
 * produces DB-friendly payloads (under a few hundred KB) even when
 * the admin drops a raw 4K photo.
 */
function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminConferencePage() {
  const [entries, setEntries] = useState<ConferenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ConferenceEntry | null>(null);

  // Page-level banner image shown centered at the top of the partner
  // Live Weekly Call page. Stored in PortalSettings.liveWeeklyBannerUrl
  // as a base64 data URL (same encoding as logoUrl / faviconUrl).
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerDragging, setBannerDragging] = useState(false);

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
  const [formJitsiRoom, setFormJitsiRoom] = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/conference");
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Show real rows — even when the array is empty. Previously we
      // substituted a hardcoded DEMO_ENTRIES pair here, which meant
      // clicking Del on the demo rows hit the API with non-existent ids
      // and bubbled a Prisma "Record to delete does not exist" error.
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Load the current banner URL once on mount. /api/admin/settings
  // returns the whole PortalSettings row; we only read the one field.
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.settings?.liveWeeklyBannerUrl) setBannerUrl(d.settings.liveWeeklyBannerUrl); })
      .catch(() => {});
  }, []);

  // ── Banner upload ──────────────────────────────────────────────────────

  const persistBanner = async (url: string) => {
    setBannerSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ liveWeeklyBannerUrl: url }),
      });
      if (!res.ok) throw new Error();
      setBannerUrl(url);
    } catch {
      alert("Failed to save banner image.");
    } finally {
      setBannerSaving(false);
    }
  };

  const handleBannerFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file (PNG, JPG, WebP, or SVG).");
      return;
    }
    try {
      let dataUrl: string;
      if (file.type === "image/svg+xml") {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onerror = reject;
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(file);
        });
      } else {
        // 1600px max keeps banners crisp on a 2x retina display
        // without blowing up the DB row.
        dataUrl = await compressImage(file, 1600, 0.85);
      }
      await persistBanner(dataUrl);
    } catch {
      alert("Failed to process image.");
    }
  };

  // ── Form helpers ───────────────────────────────────────────────────────

  const resetForm = () => {
    setFormTitle(""); setFormDescription(""); setFormHostName("");
    setFormWeekNumber(""); setFormJoinUrl(""); setFormEmbedUrl("");
    setFormRecordingUrl(""); setFormSchedule(""); setFormNextCall("");
    setFormDuration(""); setFormNotes(""); setFormIsActive(true);
    setFormJitsiRoom("");
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
    setFormJitsiRoom(entry.jitsiRoom || "");
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
      // Optional override. Empty string on create → server auto-generates
      // a slug. Empty string on edit → we leave the existing slug
      // untouched (handled server-side in the PUT handler).
      jitsiRoom: formJitsiRoom.trim() || null,
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

  const handleSyncCalendar = async (entry: ConferenceEntry) => {
    if (!entry.nextCall) {
      alert("This entry doesn't have a scheduled date yet — set one before syncing to Google Calendar.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/conference/${entry.id}/sync-to-calendar`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Sync failed");
        return;
      }
      if (data.demo) {
        alert("Calendar sync is not connected yet. Go to Admin → Settings → Google Calendar and click \"Connect Google Calendar\".");
      } else {
        alert(`Synced to Google Calendar.${data.entry?.googleCalendarHtmlLink ? `\n\nOpen event: ${data.entry.googleCalendarHtmlLink}` : ""}`);
      }
      fetchEntries();
    } catch (e) {
      alert(`Sync failed: ${(e as Error).message || e}`);
    }
  };

  const handleDelete = async (entry: ConferenceEntry) => {
    if (!confirm(`Delete "${entry.title}"?`)) return;
    try {
      const res = await fetch(`/api/admin/conference/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Delete failed (${res.status}): ${body.error || res.statusText}`);
        return;
      }
      fetchEntries();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message || e}`);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────

  const totalEntries = entries.length;
  const activeCount = entries.filter((e) => e.isActive).length;
  const pastCount = entries.filter((e) => !e.isActive).length;
  const withNotes = entries.filter((e) => e.notes).length;

  const stats = [
    { label: "Total Entries", value: totalEntries, color: "text-[var(--app-text)]" },
    { label: "Active / Upcoming", value: activeCount, color: "text-green-400" },
    { label: "Past Recordings", value: pastCount, color: "text-blue-400" },
    { label: "With Notes", value: withNotes, color: "text-amber-400" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Loading conference data...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold">Live Weekly Management</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)] mt-1">
            Manage weekly call schedule, recordings, and meeting notes.
          </p>
        </div>
        <button onClick={openAddForm} className="btn-gold text-[12px] px-4 py-2.5">
          + Add Entry
        </button>
      </div>

      {/* After-call reminder — surfaced here so the manual post-call
          workflow is discoverable. Auto-recording via paid JaaS +
          webhook is a future upgrade; until then admins fill the row
          in by hand after the call ends. */}
      <div className="mb-4 rounded-lg border border-brand-gold/25 bg-brand-gold/[0.04] px-4 py-3 flex items-start gap-3">
        <span className="text-base leading-none mt-0.5" aria-hidden>💡</span>
        <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-relaxed">
          <span className="font-semibold text-[var(--app-text)]">After each call ends:</span>{" "}
          click <strong>Edit</strong> on the entry → paste the recording link into{" "}
          <strong>Recording URL</strong> (or <strong>Embed URL</strong> for in-portal playback),
          fill in <strong>Duration</strong> and <strong>Notes</strong>, then flip <strong>Active</strong> off
          to move it to Past Recordings.{" "}
          <span className="text-[var(--app-text-muted)]">(Auto-recording is a future upgrade — paid Jitsi JaaS can webhook the recording URL straight back here.)</span>
        </div>
      </div>

      {/* Page banner upload — shows centered at the top of the partner
          Live Weekly Call page when set. Drop or pick any image; it's
          auto-compressed client-side before hitting the DB. */}
      <div
        className={`card p-4 sm:p-5 mb-6 transition-colors ${bannerDragging ? "ring-2 ring-brand-gold/40 bg-brand-gold/[0.03]" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setBannerDragging(true); }}
        onDragLeave={() => setBannerDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setBannerDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleBannerFile(file);
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-body font-semibold text-sm mb-1">Live Weekly Page Banner</div>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] max-w-md">
              Drop a photo anywhere on this card or click <strong>Upload</strong> to set a banner image.
              Shown centered at the top of the partner Live Weekly Call page. PNG, JPG, WebP, or SVG.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="font-body text-[12px] text-brand-gold/80 border border-brand-gold/30 rounded-lg px-3 py-2 hover:bg-brand-gold/10 transition-colors cursor-pointer">
              {bannerSaving ? "Saving…" : bannerUrl ? "Replace" : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                disabled={bannerSaving}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleBannerFile(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {bannerUrl && (
              <button
                type="button"
                onClick={() => void persistBanner("")}
                disabled={bannerSaving}
                className="font-body text-[12px] text-red-400/70 hover:text-red-400 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        {bannerUrl && (
          <div className="mt-4 flex justify-center">
            <img
              src={bannerUrl}
              alt="Live Weekly banner preview"
              className="max-h-48 w-auto rounded-lg border"
              style={{ borderColor: "var(--app-border)" }}
            />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="card p-4 sm:p-5">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">{s.label}</div>
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
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="Weekly Partner Training & Q&A"
              />
            </div>
            {/* Description */}
            <div className="sm:col-span-2">
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors resize-none"
                placeholder="Brief description of this entry"
              />
            </div>
            {/* Host Name */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Host Name</label>
              <input
                type="text"
                value={formHostName}
                onChange={(e) => setFormHostName(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="Fintella Leadership Team"
              />
            </div>
            {/* Week Number */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Week Number</label>
              <input
                type="number"
                value={formWeekNumber}
                onChange={(e) => setFormWeekNumber(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="13"
              />
            </div>
            {/* Join URL */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Join URL (Zoom/Meet)</label>
              <input
                type="text"
                value={formJoinUrl}
                onChange={(e) => setFormJoinUrl(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="https://zoom.us/j/..."
              />
            </div>
            {/* Embed URL */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Embed URL (YouTube/Vimeo)</label>
              <input
                type="text"
                value={formEmbedUrl}
                onChange={(e) => setFormEmbedUrl(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="https://www.youtube.com/embed/..."
              />
            </div>
            {/* Recording URL */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Recording URL (External)</label>
              <input
                type="text"
                value={formRecordingUrl}
                onChange={(e) => setFormRecordingUrl(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="https://zoom.us/rec/share/..."
              />
            </div>
            {/* Schedule */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Schedule</label>
              <input
                type="text"
                value={formSchedule}
                onChange={(e) => setFormSchedule(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="Every Thursday at 2:00 PM ET"
              />
            </div>
            {/* Next Call Date */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Call Date</label>
              <input
                type="datetime-local"
                value={formNextCall}
                onChange={(e) => setFormNextCall(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
              />
            </div>
            {/* Duration */}
            <div>
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Duration</label>
              <input
                type="text"
                value={formDuration}
                onChange={(e) => setFormDuration(e.target.value)}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors"
                placeholder="52 min"
              />
            </div>
            {/* Jitsi Room Slug — partners join this room in-portal via iframe.
                Leave blank on create and the server auto-generates a unique
                slug from the id + week number. Admin can edit after create
                to use a vanity slug (e.g. "fintella-weekly-301-update"). */}
            <div className="sm:col-span-2">
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Jitsi Room Slug</label>
              <input
                type="text"
                value={formJitsiRoom}
                onChange={(e) => setFormJitsiRoom(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, "-"))}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors font-mono"
                placeholder={editingItem ? "Leave blank to keep existing" : "Leave blank to auto-generate (recommended)"}
              />
              {formJitsiRoom && (
                <div className="mt-1.5 font-body text-[11px] text-[var(--app-text-muted)]">
                  Partners join in-portal. Full URL: <span className="font-mono text-[var(--app-text-secondary)]">https://meet.jit.si/{formJitsiRoom}</span>
                </div>
              )}
              {!formJitsiRoom && !editingItem && (
                <div className="mt-1.5 font-body text-[11px] text-[var(--app-text-muted)]">
                  A unique Jitsi slug is generated automatically from the week number when you save.
                </div>
              )}
            </div>
            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider block mb-1">Notes (Markdown)</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={6}
                className="w-full bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] focus:border-brand-gold/40 focus:outline-none transition-colors resize-none"
                placeholder="**Key Topics:**&#10;- Topic 1&#10;- Topic 2&#10;&#10;**Action Items:**&#10;- Item 1"
              />
            </div>
            {/* Active toggle */}
            <div className="sm:col-span-2 flex items-center gap-3">
              <label className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">Active</label>
              <button
                type="button"
                onClick={() => setFormIsActive(!formIsActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formIsActive ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formIsActive ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <span className="font-body text-[12px] text-[var(--app-text-secondary)]">{formIsActive ? "Active (upcoming)" : "Inactive (past recording)"}</span>
            </div>
          </div>
          {/* Form actions */}
          <div className="flex gap-3 mt-5">
            <button onClick={handleSave} className="btn-gold text-[12px] px-5 py-2.5">
              {editingItem ? "Save Changes" : "Create Entry"}
            </button>
            <button onClick={resetForm} className="font-body text-[12px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-5 py-2.5 hover:text-[var(--app-text-secondary)] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ═══ TABLE (desktop) ═══ */}
      <div className="card hidden sm:block">
        {/* Table header */}
        <div className="grid grid-cols-[60px_1fr_90px_140px_100px_80px_70px_70px_80px_200px] gap-2 px-5 py-3 border-b border-[var(--app-border)]">
          {["Wk #", "Title", "URL", "Host", "Date", "Duration", "Rec?", "Notes?", "Status", "Actions"].map((h) => (
            <div key={h} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">{h}</div>
          ))}
        </div>
        {/* Table rows */}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-[60px_1fr_90px_140px_100px_80px_70px_70px_80px_200px] gap-2 px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors items-center"
          >
            <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{entry.weekNumber || "—"}</div>
            <div className="font-body text-[13px] text-[var(--app-text)] truncate">{entry.title}</div>
            <div>
              {entry.jitsiRoom ? (
                <a
                  href={`https://meet.jit.si/${entry.jitsiRoom}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-body text-[10px] text-brand-gold border border-brand-gold/30 rounded px-2 py-1 hover:bg-brand-gold/10 transition-colors whitespace-nowrap"
                  title={`https://meet.jit.si/${entry.jitsiRoom}`}
                >
                  📹 Join
                </a>
              ) : entry.joinUrl ? (
                <a
                  href={entry.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-body text-[10px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded px-2 py-1 hover:bg-[var(--app-card-bg)] transition-colors whitespace-nowrap"
                  title={entry.joinUrl}
                >
                  ↗ Open
                </a>
              ) : (
                <span className="font-body text-[12px] text-[var(--app-text-muted)]">—</span>
              )}
            </div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)] truncate">{entry.hostName || "—"}</div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{fmtDate(entry.nextCall)}</div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{entry.duration || "—"}</div>
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
                className="font-body text-[10px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded px-2 py-1 hover:bg-[var(--app-card-bg)] transition-colors"
              >
                {entry.isActive ? "Archive" : "Activate"}
              </button>
              <button
                onClick={() => handleSyncCalendar(entry)}
                className={`font-body text-[10px] border rounded px-2 py-1 transition-colors ${
                  entry.googleCalendarEventId
                    ? "text-green-400/80 border-green-400/30 hover:bg-green-400/10"
                    : "text-blue-400/70 border-blue-400/25 hover:bg-blue-400/10"
                }`}
                title={entry.googleCalendarEventId ? "Re-sync to Google Calendar" : "Sync to Google Calendar"}
              >
                {entry.googleCalendarEventId ? "📅 Synced" : "📅 Sync"}
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
            <div className="font-body text-[13px] text-[var(--app-text-muted)]">No conference entries yet.</div>
          </div>
        )}
      </div>

      {/* ═══ MOBILE CARDS ═══ */}
      <div className="sm:hidden space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-body text-[13px] text-[var(--app-text)] font-medium truncate">
                  {entry.weekNumber ? `Wk ${entry.weekNumber} — ` : ""}{entry.title}
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                  {fmtDate(entry.nextCall)} · {entry.duration || "—"}{entry.hostName ? ` · ${entry.hostName}` : ""}
                </div>
              </div>
              <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${entry.isActive ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                {entry.isActive ? "Active" : "Past"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--app-text-muted)] mb-3">
              <span>Rec: {entry.embedUrl || entry.recordingUrl ? "✓" : "—"}</span>
              <span>Notes: {entry.notes ? "✓" : "—"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.jitsiRoom ? (
                <a
                  href={`https://meet.jit.si/${entry.jitsiRoom}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-body text-[11px] text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
                >
                  📹 Join
                </a>
              ) : entry.joinUrl ? (
                <a
                  href={entry.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-body text-[11px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--app-card-bg)] transition-colors"
                >
                  ↗ Open
                </a>
              ) : null}
              <button
                onClick={() => openEditForm(entry)}
                className="font-body text-[11px] text-brand-gold/60 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleToggleActive(entry)}
                className="font-body text-[11px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 hover:bg-[var(--app-card-bg)] transition-colors"
              >
                {entry.isActive ? "Archive" : "Activate"}
              </button>
              <button
                onClick={() => handleSyncCalendar(entry)}
                className={`font-body text-[11px] border rounded-lg px-3 py-1.5 transition-colors ${
                  entry.googleCalendarEventId
                    ? "text-green-400/80 border-green-400/30 hover:bg-green-400/10"
                    : "text-blue-400/70 border-blue-400/25 hover:bg-blue-400/10"
                }`}
              >
                {entry.googleCalendarEventId ? "📅 Synced" : "📅 Sync"}
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
