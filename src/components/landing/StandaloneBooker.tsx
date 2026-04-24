"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Booker-only flow for /booker?applicationId=X. Used when the intake
 * form lives on an external landing (Systeme.io / Framer / ClickFunnels)
 * and the external landing posts to /api/apply then redirects here with
 * the returned applicationId.
 *
 * Copy-reduced twin of the booker step inside ApplyFlow — same slot list
 * + reserve endpoint, just no form before it. Renders a clear error if
 * applicationId is missing or invalid.
 */

type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  seatsTaken: number;
  seatsLeft: number;
  location: string;
  title: string;
  notes: string | null;
};

function formatSlotTime(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const duration = Math.round((e.getTime() - s.getTime()) / 60000);
  return `${dateFmt.format(s)} · ${timeFmt.format(s)} (${duration} min)`;
}

export default function StandaloneBooker({ applicationId }: { applicationId: string | null }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    slotTitle: string;
    startsAt: string;
    endsAt: string;
    joinUrl: string | null;
  } | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/booking/slots");
      const data = await res.json();
      setSlots(data.slots ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (applicationId) fetchSlots();
  }, [applicationId, fetchSlots]);

  async function reserveSlot(slotId: string) {
    if (!applicationId) return;
    setReservingId(slotId);
    setError(null);
    try {
      const res = await fetch("/api/booking/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, slotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Booking failed — please try another slot.");
        setReservingId(null);
        fetchSlots();
        return;
      }
      if (typeof window !== "undefined" && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: "partner_call_booked",
          applicationId,
          slotId,
        });
      }
      setConfirmation({
        slotTitle: data.slot.title,
        startsAt: data.slot.startsAt,
        endsAt: data.slot.endsAt,
        joinUrl: data.slot.joinUrl,
      });
    } catch {
      setError("Network error during booking.");
      setReservingId(null);
    }
  }

  if (!applicationId) {
    return (
      <div className="text-center space-y-4 py-6">
        <div className="text-5xl">🤷</div>
        <h2 className="text-xl font-bold">Application not found</h2>
        <p className="text-[var(--app-text-muted)]">
          This booker page needs an application ID. If you arrived here from our landing page, please go back and submit the application form again.
        </p>
        <a href="/" className="btn-gold inline-block">Back to landing</a>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="text-center space-y-5 py-4">
        <div className="text-6xl">🎉</div>
        <div>
          <h2 className="text-2xl font-bold">You're booked!</h2>
          <p className="text-[var(--app-text-muted)] mt-2">
            Calendar invite for {confirmation.slotTitle} is on its way to your inbox.
          </p>
        </div>
        <div className="p-4 rounded-xl border border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/5 text-left space-y-2 max-w-md mx-auto">
          <div className="text-xs uppercase tracking-wider text-[var(--brand-gold)]">Your call</div>
          <div className="font-semibold">{confirmation.slotTitle}</div>
          <div className="text-sm text-[var(--app-text-muted)]">
            {formatSlotTime(confirmation.startsAt, confirmation.endsAt)}
          </div>
          {confirmation.joinUrl && (
            <a href={confirmation.joinUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-[var(--brand-gold)] font-semibold hover:underline">
              Join link (save for later) ↗
            </a>
          )}
        </div>
        <div className="pt-2 text-sm text-[var(--app-text-muted)]">
          Questions? Reply to the email we sent and we'll get right back to you.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Book your qualification call</h2>
        <p className="text-sm text-[var(--app-text-muted)] mt-1">
          A short chat with Fintella's founder to confirm fit. Pick any time — most calls last 20–30 minutes.
        </p>
      </div>
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="text-center text-[var(--app-text-muted)] py-8">Loading available times…</div>
      ) : slots.length === 0 ? (
        <div className="p-5 rounded-xl bg-[var(--app-input-bg)] border border-[var(--app-border)] text-sm text-[var(--app-text-muted)]">
          No open slots at the moment — your application is safely in our queue and we'll reach out directly within 24 hours to schedule a call.
        </div>
      ) : (
        <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
          {slots.map((slot) => {
            const isLoading = reservingId === slot.id;
            const locationLabel =
              slot.location === "jitsi" ? "Video call" : slot.location === "zoom" ? "Zoom" : slot.location === "phone" ? "Phone" : slot.location;
            return (
              <button
                key={slot.id}
                onClick={() => reserveSlot(slot.id)}
                disabled={isLoading || !!reservingId}
                className="text-left p-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] hover:border-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/5 transition disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{formatSlotTime(slot.startsAt, slot.endsAt)}</div>
                    <div className="text-xs text-[var(--app-text-muted)]">
                      {locationLabel}
                      {slot.capacity > 1 ? ` · ${slot.seatsLeft} of ${slot.capacity} seats left` : ""}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-[var(--brand-gold)]">
                    {isLoading ? "Booking…" : "Book →"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
