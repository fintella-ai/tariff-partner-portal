"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WebinarRegistrationForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState({ minutes: 14, seconds: 59 });

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev.minutes === 0 && prev.seconds === 0) return { minutes: 14, seconds: 59 };
        if (prev.seconds === 0) return { minutes: prev.minutes - 1, seconds: 59 };
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function submit() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/webinar/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.push("/webinar/watch?name=" + encodeURIComponent(form.name.split(" ")[0]));
      } else {
        const data = await res.json().catch(() => ({ error: "Something went wrong" }));
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
      {/* Urgency countdown */}
      <div className="text-center mb-5">
        <div className="inline-block bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 mb-3">
          <div className="text-xs text-red-400 uppercase tracking-wider font-semibold">Next session starts in</div>
          <div className="font-display text-2xl font-bold text-red-400">
            {String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
          </div>
        </div>
        <h2 className="font-display text-lg" style={{ color: "#c4a050" }}>Reserve Your Seat</h2>
        <p className="text-xs text-white/40 mt-1">Watch instantly after registering — no waiting.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm mb-4">{error}</div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Your Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
            placeholder="John Smith"
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Business Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
            placeholder="john@customsbroker.com"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Company</label>
          <input
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
            placeholder="Smith Customs Brokerage"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Phone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={saving}
        className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm text-black disabled:opacity-50"
        style={{ background: "#c4a050" }}
      >
        {saving ? "Registering..." : "Watch the Webinar Now →"}
      </button>

      <p className="text-[10px] text-white/20 text-center mt-4">
        We respect your privacy. No spam. Unsubscribe anytime.
      </p>
    </div>
  );
}
