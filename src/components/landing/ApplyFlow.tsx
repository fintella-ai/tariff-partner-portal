"use client";

import { useState, useEffect, useCallback } from "react";

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

type Step = "form" | "booking" | "confirmed";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  companyName: "",
  website: "",
  audienceContext: "",
  referralSource: "",
};

function formatSlotTime(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const duration = Math.round((e.getTime() - s.getTime()) / 60000);
  return `${dateFmt.format(s)} · ${timeFmt.format(s)} (${duration} min)`;
}

export default function ApplyFlow({ variant = "full" }: { variant?: "full" | "compact" }) {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    slotTitle: string;
    startsAt: string;
    endsAt: string;
    joinUrl: string | null;
  } | null>(null);

  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [alreadyPartner, setAlreadyPartner] = useState(false);

  const fetchSlots = useCallback(async () => {
    setLoadingSlots(true);
    try {
      const res = await fetch("/api/booking/slots");
      const data = await res.json();
      setSlots(data.slots ?? []);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (step === "booking") fetchSlots();
  }, [step, fetchSlots]);

  function updateField<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function captureUtm() {
    if (typeof window === "undefined") return {};
    const p = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach((k) => {
      const v = p.get(k);
      if (v) utm[k] = v;
    });
    return utm;
  }

  async function submitApplication(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("Please fill in your name and email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...captureUtm() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Submission failed — please try again.");
        return;
      }
      setAlreadyApplied(!!data.alreadyApplied);
      setAlreadyPartner(!!data.alreadyPartner);
      if (data.alreadyPartner) {
        setStep("confirmed");
        setConfirmation(null);
        return;
      }
      setApplicationId(data.applicationId);

      if (typeof window !== "undefined" && (window as any).dataLayer) {
        (window as any).dataLayer.push({
          event: "partner_application_submitted",
          applicationId: data.applicationId,
        });
      }

      setStep("booking");
    } catch (err) {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reserveSlot(slotId: string) {
    if (!applicationId) return;
    setBookingSlotId(slotId);
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
        setBookingSlotId(null);
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
      setStep("confirmed");
    } catch (err) {
      setError("Network error during booking.");
      setBookingSlotId(null);
    }
  }

  function skipBooking() {
    setConfirmation(null);
    setStep("confirmed");
  }

  if (step === "confirmed") {
    return (
      <ConfirmationCard
        confirmation={confirmation}
        alreadyApplied={alreadyApplied}
        alreadyPartner={alreadyPartner}
      />
    );
  }

  if (step === "booking") {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-xl font-bold">Step 2 — Book your qualification call</h3>
          <p className="text-sm text-[var(--app-text-muted)] mt-1">
            A short chat with Fintella's founder to confirm fit. Pick any time that works — most calls last 20–30 minutes.
          </p>
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm">
            {error}
          </div>
        )}
        {loadingSlots ? (
          <div className="text-center text-[var(--app-text-muted)] py-8">Loading available times…</div>
        ) : slots.length === 0 ? (
          <div className="p-5 rounded-xl bg-[var(--app-input-bg)] border border-[var(--app-border)] text-sm text-[var(--app-text-muted)]">
            No open slots at the moment — but your application is in. We'll reach out directly within 24 hours to schedule a call.
            <button
              onClick={skipBooking}
              className="block mt-3 text-[var(--brand-gold)] font-semibold hover:underline"
            >
              Got it — I'll wait for an email →
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 max-h-[380px] overflow-y-auto pr-1">
              {slots.map((slot) => {
                const isLoading = bookingSlotId === slot.id;
                const locationLabel =
                  slot.location === "jitsi" || slot.location === "google_meet" ? "Video call" : slot.location === "zoom" ? "Zoom" : slot.location === "phone" ? "Phone" : slot.location;
                return (
                  <button
                    key={slot.id}
                    onClick={() => reserveSlot(slot.id)}
                    disabled={isLoading || !!bookingSlotId}
                    className="text-left p-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] hover:border-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/5 transition disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{formatSlotTime(slot.startsAt, slot.endsAt)}</div>
                        <div className="text-xs text-[var(--app-text-muted)]">
                          {locationLabel}{slot.capacity > 1 ? ` · ${slot.seatsLeft} of ${slot.capacity} seats left` : ""}
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
            <button
              onClick={skipBooking}
              className="text-sm text-[var(--app-text-muted)] hover:text-[var(--brand-gold)]"
            >
              None of these work — I'll wait for an email
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submitApplication} className="space-y-4">
      {variant === "full" && (
        <div>
          <h3 className="text-xl font-bold">Apply to become a referral partner</h3>
          <p className="text-sm text-[var(--app-text-muted)] mt-1">
            Takes 60 seconds. We'll follow up with a short qualification call.
          </p>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          required
          type="text"
          placeholder="First name *"
          value={form.firstName}
          onChange={(e) => updateField("firstName", e.target.value)}
          className="w-full theme-input rounded-lg px-4 py-3"
          maxLength={100}
        />
        <input
          required
          type="text"
          placeholder="Last name *"
          value={form.lastName}
          onChange={(e) => updateField("lastName", e.target.value)}
          className="w-full theme-input rounded-lg px-4 py-3"
          maxLength={100}
        />
      </div>
      <input
        required
        type="email"
        placeholder="Email *"
        value={form.email}
        onChange={(e) => updateField("email", e.target.value)}
        className="w-full theme-input rounded-lg px-4 py-3"
        maxLength={200}
      />
      <input
        type="tel"
        placeholder="Phone (optional)"
        value={form.phone}
        onChange={(e) => updateField("phone", e.target.value)}
        className="w-full theme-input rounded-lg px-4 py-3"
        maxLength={50}
      />
      <input
        type="text"
        placeholder="Company (optional)"
        value={form.companyName}
        onChange={(e) => updateField("companyName", e.target.value)}
        className="w-full theme-input rounded-lg px-4 py-3"
        maxLength={200}
      />
      <input
        type="url"
        placeholder="Website (optional)"
        value={form.website}
        onChange={(e) => updateField("website", e.target.value)}
        className="w-full theme-input rounded-lg px-4 py-3"
        maxLength={300}
      />
      <textarea
        placeholder="Tell us about your network — industries, clients, or deals you can bring to the table"
        value={form.audienceContext}
        onChange={(e) => updateField("audienceContext", e.target.value)}
        className="w-full theme-input rounded-lg px-4 py-3"
        rows={3}
        maxLength={2000}
      />
      <input
        type="text"
        placeholder="How did you hear about us? (optional)"
        value={form.referralSource}
        onChange={(e) => updateField("referralSource", e.target.value)}
        className="w-full theme-input rounded-lg px-4 py-3"
        maxLength={200}
      />
      <button
        type="submit"
        disabled={submitting}
        className="btn-gold w-full disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Apply Now →"}
      </button>
      <p className="text-xs text-[var(--app-text-muted)] text-center">
        Applying does not create a partner account — our team will review, schedule a quick call, and approve qualified partners manually.
      </p>
    </form>
  );
}

function ConfirmationCard({
  confirmation,
  alreadyApplied,
  alreadyPartner,
}: {
  confirmation: {
    slotTitle: string;
    startsAt: string;
    endsAt: string;
    joinUrl: string | null;
  } | null;
  alreadyApplied: boolean;
  alreadyPartner: boolean;
}) {
  if (alreadyPartner) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="text-5xl">👋</div>
        <h3 className="text-2xl font-bold">Welcome back</h3>
        <p className="text-[var(--app-text-muted)]">
          It looks like you already have a Fintella partner account for that email. Log in to pick up where you left off.
        </p>
        <a
          href="/login"
          className="btn-gold inline-block"
        >
          Log in to the portal →
        </a>
      </div>
    );
  }

  return (
    <div className="text-center space-y-5 py-4">
      <div className="text-6xl">🎉</div>
      <div>
        <h3 className="text-2xl font-bold">
          {confirmation ? "You're booked!" : alreadyApplied ? "You're already on our radar" : "Application received"}
        </h3>
        <p className="text-[var(--app-text-muted)] mt-2">
          {confirmation
            ? `Calendar invite for ${confirmation.slotTitle} is on its way to your inbox.`
            : alreadyApplied
            ? "We received your previous application and are reviewing it. Keep an eye on your inbox."
            : "We'll reach out directly within 24 hours to schedule a qualification call."}
        </p>
      </div>
      {confirmation && (
        <div className="p-4 rounded-xl border border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/5 text-left space-y-2 max-w-md mx-auto">
          <div className="text-xs uppercase tracking-wider text-[var(--brand-gold)]">Your call</div>
          <div className="font-semibold">{confirmation.slotTitle}</div>
          <div className="text-sm text-[var(--app-text-muted)]">
            {formatSlotTime(confirmation.startsAt, confirmation.endsAt)}
          </div>
          {confirmation.joinUrl && (
            <a
              href={confirmation.joinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm text-[var(--brand-gold)] font-semibold hover:underline"
            >
              Join link (save for later) ↗
            </a>
          )}
        </div>
      )}
      <div className="pt-2 text-sm text-[var(--app-text-muted)]">
        Questions? Reply to the email we sent and we'll get right back to you.
      </div>
    </div>
  );
}
