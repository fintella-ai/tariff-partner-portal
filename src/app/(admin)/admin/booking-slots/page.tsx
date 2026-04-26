"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";

type Booking = {
  id: string;
  name: string;
  email: string;
  applicationId: string;
};

type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  location: string;
  title: string;
  notes: string | null;
  status: string;
  googleEventId: string | null;
  jitsiRoom: string | null;
  createdAt: string;
  bookings: Booking[];
};

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminBookingSlotsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  const tomorrow9 = new Date();
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const tomorrow930 = new Date(tomorrow9);
  tomorrow930.setMinutes(30);

  const [form, setForm] = useState({
    startsAt: toDatetimeLocal(tomorrow9),
    endsAt: toDatetimeLocal(tomorrow930),
    capacity: 1,
    location: "google_meet",
    title: "Partner Qualification Call",
    notes: "",
  });

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/booking-slots");
      const data = await res.json();
      setSlots(data.slots ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  function flash(tone: "ok" | "err", msg: string) {
    setBanner({ tone, msg });
    setTimeout(() => setBanner(null), 4000);
  }

  async function createSlot(e: React.FormEvent) {
    e.preventDefault();
    const startsAt = new Date(form.startsAt).toISOString();
    const endsAt = new Date(form.endsAt).toISOString();
    const res = await fetch("/api/admin/booking-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startsAt,
        endsAt,
        capacity: Number(form.capacity),
        location: form.location,
        title: form.title,
        notes: form.notes,
      }),
    });
    if (res.ok) {
      flash("ok", "Slot created");
      setForm({ ...form, notes: "" });
      fetchSlots();
    } else {
      const { error } = await res.json().catch(() => ({ error: "Create failed" }));
      flash("err", error);
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/booking-slots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      flash("ok", `Slot ${status}`);
      fetchSlots();
    } else {
      flash("err", "Update failed");
    }
  }

  async function deleteSlot(slot: Slot) {
    if (slot.bookings.length > 0) {
      if (!confirm(`This slot has ${slot.bookings.length} booking(s). Deleting it will cancel them (applicants will NOT be auto-notified — email them first). Continue?`)) return;
    } else if (!confirm("Delete this slot?")) return;
    const res = await fetch(`/api/admin/booking-slots/${slot.id}`, { method: "DELETE" });
    if (res.ok) {
      flash("ok", "Slot deleted");
      fetchSlots();
    } else {
      flash("err", "Delete failed");
    }
  }

  const now = new Date();
  const upcoming = slots.filter((s) => new Date(s.endsAt) > now);
  const past = slots.filter((s) => new Date(s.endsAt) <= now);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 text-left">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Booking Slots</h1>
          <p className="text-sm text-[var(--app-text-muted)] mt-1">
            Time windows applicants can reserve for qualification calls. Capacity 1–5 seats per slot.
          </p>
        </div>
        <Link
          href="/admin/applications"
          className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm hover:bg-[var(--app-input-bg)] transition"
        >
          ← Back to Applications
        </Link>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            banner.tone === "ok"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          }`}
        >
          {banner.msg}
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">Create a new slot</h2>
        <form onSubmit={createSlot} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">Starts at</div>
            <input
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              className="w-full theme-input rounded-lg px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">Ends at</div>
            <input
              type="datetime-local"
              required
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              className="w-full theme-input rounded-lg px-3 py-2"
            />
          </label>
          <label className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">Seats (capacity)</div>
            <select
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              className="w-full theme-input rounded-lg px-3 py-2"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? "seat (1:1)" : "seats (group)"}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">Location</div>
            <select
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full theme-input rounded-lg px-3 py-2"
            >
              <option value="google_meet">Google Meet (auto)</option>
              <option value="zoom">Zoom (manual link)</option>
              <option value="phone">Phone</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">Title</div>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full theme-input rounded-lg px-3 py-2"
              maxLength={120}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-xs uppercase tracking-wider text-[var(--app-text-muted)]">Notes (visible to applicants)</div>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full theme-input rounded-lg px-3 py-2"
              maxLength={300}
              placeholder="Optional — e.g. 'Please have your company details ready'"
            />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="btn-gold">Create Slot</button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming ({upcoming.length})</h2>
        {loading ? (
          <div className="text-center text-[var(--app-text-muted)] py-8">Loading…</div>
        ) : upcoming.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[var(--app-text-muted)]">
            No upcoming slots. Create one above to start accepting bookings.
          </div>
        ) : (
          upcoming.map((slot) => <SlotRow key={slot.id} slot={slot} onStatusChange={updateStatus} onDelete={deleteSlot} />)
        )}
      </div>

      {past.length > 0 && (
        <div className="space-y-3 pt-4">
          <h2 className="text-lg font-semibold text-[var(--app-text-muted)]">Past ({past.length})</h2>
          {past.slice(0, 10).map((slot) => <SlotRow key={slot.id} slot={slot} onStatusChange={updateStatus} onDelete={deleteSlot} faded />)}
        </div>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  onStatusChange,
  onDelete,
  faded,
}: {
  slot: Slot;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (s: Slot) => void;
  faded?: boolean;
}) {
  const seatsLeft = Math.max(0, slot.capacity - slot.bookings.length);
  return (
    <div className={`card p-4 ${faded ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{slot.title}</div>
          <div className="text-sm text-[var(--app-text-muted)]">
            {fmtDateTime(slot.startsAt)} — {fmtDateTime(slot.endsAt)}
          </div>
          <div className="text-xs text-[var(--app-text-muted)] mt-1">
            {slot.location === "google_meet" || slot.location === "jitsi" ? "Google Meet" : slot.location}
          </div>
          {slot.notes && (
            <div className="text-xs text-[var(--app-text-muted)] mt-1 italic">{slot.notes}</div>
          )}
        </div>
        <div className="text-right space-y-1">
          <div className={`text-sm font-semibold ${seatsLeft === 0 ? "text-red-400" : "text-green-400"}`}>
            {slot.bookings.length} / {slot.capacity} booked
          </div>
          <div className={`text-xs inline-block px-2 py-0.5 rounded-full border ${
            slot.status === "open"
              ? "bg-green-500/10 text-green-400 border-green-500/20"
              : slot.status === "closed"
              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          }`}>
            {slot.status}
          </div>
        </div>
      </div>

      {slot.bookings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--app-border)] space-y-1">
          {slot.bookings.map((b) => (
            <div key={b.id} className="text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
              <span className="font-medium">{b.name}</span>
              <span className="text-[var(--app-text-muted)]">· {b.email}</span>
              <Link href={`/admin/applications`} className="ml-auto text-[var(--brand-gold)] hover:underline">view app →</Link>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-[var(--app-border)] flex gap-2 flex-wrap">
        {slot.status === "open" ? (
          <button onClick={() => onStatusChange(slot.id, "closed")} className="px-3 py-1 text-xs rounded-md border border-[var(--app-border)]">
            Close slot
          </button>
        ) : slot.status === "closed" ? (
          <button onClick={() => onStatusChange(slot.id, "open")} className="px-3 py-1 text-xs rounded-md border border-[var(--app-border)]">
            Re-open
          </button>
        ) : null}
        {slot.status !== "canceled" && (
          <button onClick={() => onStatusChange(slot.id, "canceled")} className="px-3 py-1 text-xs rounded-md text-red-400 hover:bg-red-500/10">
            Cancel slot
          </button>
        )}
        <button onClick={() => onDelete(slot)} className="px-3 py-1 text-xs rounded-md text-red-400 hover:bg-red-500/10 ml-auto">
          Delete
        </button>
      </div>
    </div>
  );
}
