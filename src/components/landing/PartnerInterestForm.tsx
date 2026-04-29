"use client";

import { useState } from "react";

const PROFESSIONAL_TYPES = [
  "Licensed Customs Broker",
  "Freight Forwarder",
  "Trade Compliance Consultant",
  "CPA / Accounting Firm",
  "Import/Export Company",
  "Law Firm",
  "Other",
];

export default function PartnerInterestForm() {
  const [step, setStep] = useState<"form" | "done">("form");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    professionalType: "",
    estimatedClients: "",
    message: "",
  });

  async function submit() {
    if (!form.name.trim() || !form.email.trim() || !form.company.trim()) {
      setError("Please fill in your name, email, and company.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/partners/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setStep("done");
      else {
        const data = await res.json().catch(() => ({ error: "Something went wrong" }));
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (step === "done") {
    return (
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-sm text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="font-display text-xl mb-2" style={{ color: "#c4a050" }}>Application Received</h2>
        <p className="text-sm text-white/60 mb-4">
          Thank you for your interest in the Fintella Partner Program. A member of our team will review your application and reach out within 24 hours.
        </p>
        <p className="text-xs text-white/30">
          In the meantime, feel free to explore our <a href="/recover" className="text-[#c4a050]/70 hover:text-[#c4a050] transition underline">client refund calculator</a> to see how it works.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
      <h2 className="font-display text-xl mb-1" style={{ color: "#c4a050" }}>Apply to Partner</h2>
      <p className="text-sm text-white/40 mb-5">Free to join. No obligations. Start earning on referrals.</p>

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
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
            placeholder="john@customsbroker.com"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Company *</label>
          <input
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
            placeholder="Smith Customs Brokerage LLC"
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
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Professional Type</label>
          <select
            value={form.professionalType}
            onChange={(e) => setForm((f) => ({ ...f, professionalType: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40 appearance-none"
          >
            <option value="" className="bg-[#0c1220]">Select your profession</option>
            {PROFESSIONAL_TYPES.map((t) => (
              <option key={t} value={t} className="bg-[#0c1220]">{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Approximate Number of Importer Clients</label>
          <input
            value={form.estimatedClients}
            onChange={(e) => setForm((f) => ({ ...f, estimatedClients: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
            placeholder="e.g. 50"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Anything else you&apos;d like us to know?</label>
          <textarea
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40 resize-none"
            rows={3}
            placeholder="Optional — tell us about your practice"
          />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={saving}
        className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm text-black disabled:opacity-50"
        style={{ background: "#c4a050" }}
      >
        {saving ? "Submitting..." : "Apply to Become a Partner"}
      </button>

      <p className="text-[10px] text-white/20 text-center mt-4">
        By applying, you agree to our <a href="/terms" className="underline hover:text-white/30">Terms</a> and <a href="/privacy" className="underline hover:text-white/30">Privacy Policy</a>.
      </p>
    </div>
  );
}
