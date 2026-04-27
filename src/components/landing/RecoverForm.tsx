"use client";

import { useState } from "react";

// Common HTS chapters affected by IEEPA tariffs
const HTS_CATEGORIES = [
  { code: "84-85", label: "Electronics & Machinery", rate: 0.25, example: "Computers, phones, appliances, industrial equipment" },
  { code: "61-62", label: "Apparel & Textiles", rate: 0.25, example: "Clothing, fabrics, shoes, accessories" },
  { code: "94", label: "Furniture", rate: 0.25, example: "Office furniture, home furnishings, mattresses" },
  { code: "39-40", label: "Plastics & Rubber", rate: 0.25, example: "Packaging, containers, tires, gaskets" },
  { code: "73", label: "Steel & Iron Products", rate: 0.25, example: "Pipes, fasteners, structures, tools" },
  { code: "87", label: "Vehicles & Parts", rate: 0.25, example: "Auto parts, trailers, accessories" },
  { code: "90", label: "Medical & Scientific", rate: 0.25, example: "Medical devices, lab equipment, optical" },
  { code: "95", label: "Toys & Sports Equipment", rate: 0.25, example: "Games, exercise equipment, outdoor gear" },
  { code: "other", label: "Other Imported Goods", rate: 0.20, example: "Food, chemicals, minerals, wood, paper" },
];

const ENTRY_PERIODS = [
  { label: "2025 only", months: 10, phase: "Phase 1 — CAPE ready now", eligible: true, urgency: "File immediately" },
  { label: "2024–2025", months: 18, phase: "Phase 1 — CAPE ready now", eligible: true, urgency: "File this week" },
  { label: "2023–2025", months: 30, phase: "Phases 1 & 2", eligible: true, urgency: "Most entries eligible" },
  { label: "Before 2023", months: 36, phase: "May require protest filing", eligible: true, urgency: "180-day protest deadline — act now" },
  { label: "Not sure", months: 18, phase: "We'll help you check", eligible: true, urgency: "Specialist will review your entries" },
];

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

interface Props {
  partnerCode: string | null;
}

export default function RecoverForm({ partnerCode }: Props) {
  const [step, setStep] = useState<"product" | "duties" | "timing" | "result" | "contact" | "done">("product");
  const [selectedCategory, setSelectedCategory] = useState<typeof HTS_CATEGORIES[0] | null>(null);
  const [customDuties, setCustomDuties] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<typeof ENTRY_PERIODS[0] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    companyName: "", contactName: "", email: "", phone: "",
  });

  const dutiesAmount = customDuties ? parseFloat(customDuties.replace(/[^0-9.]/g, "")) || 0 : 0;
  const effectiveRate = selectedCategory?.rate || 0.20;
  const estimatedRefund = Math.round(dutiesAmount * 0.85);
  const estimatedInterest = Math.round(dutiesAmount * 0.07 * (selectedPeriod?.months || 12) / 12);
  const totalRecovery = estimatedRefund + estimatedInterest;
  const dailyInterest = Math.round(dutiesAmount * 0.07 / 365);

  async function submit() {
    if (!form.companyName.trim() || !form.contactName.trim() || !form.email.trim()) {
      setError("Please fill in company name, contact name, and email.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          importProducts: selectedCategory?.label || "Not specified",
          estimatedDuties: dutiesAmount,
          estimatedRefund: totalRecovery,
          entryPeriod: selectedPeriod?.label,
          htsCategory: selectedCategory?.code,
          partnerCode,
        }),
      });
      if (res.ok) setStep("done");
      else {
        const data = await res.json().catch(() => ({ error: "Something went wrong" }));
        setError(data.error || "Something went wrong.");
      }
    } catch { setError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  const progress = step === "product" ? 1 : step === "duties" ? 2 : step === "timing" ? 3 : step === "result" ? 4 : step === "contact" ? 5 : 5;

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
      {/* Progress bar */}
      {step !== "done" && (
        <div className="flex gap-1 mb-6">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= progress ? "bg-[#c4a050]" : "bg-white/10"}`} />
          ))}
        </div>
      )}

      {/* Step 1: What do you import? */}
      {step === "product" && (
        <>
          <h2 className="font-display text-xl mb-1" style={{ color: "#c4a050" }}>What do you import?</h2>
          <p className="text-sm text-white/50 mb-5">Select the category that best matches your imports.</p>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {HTS_CATEGORIES.map((c) => (
              <button
                key={c.code}
                onClick={() => { setSelectedCategory(c); setStep("duties"); }}
                className="w-full text-left px-4 py-3 rounded-xl border border-white/10 text-sm hover:border-white/20 hover:bg-white/[0.02] transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white/80 font-medium">{c.label}</span>
                    <span className="text-white/30 text-xs ml-2">HTS {c.code}</span>
                  </div>
                  <span className="text-white/20 group-hover:text-white/40 transition">→</span>
                </div>
                <div className="text-[11px] text-white/30 mt-0.5">{c.example}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Step 2: How much in duties? */}
      {step === "duties" && (
        <>
          <h2 className="font-display text-xl mb-1" style={{ color: "#c4a050" }}>Approximate IEEPA duties paid?</h2>
          <p className="text-sm text-white/50 mb-1">Category: <strong className="text-white/70">{selectedCategory?.label}</strong></p>
          <p className="text-sm text-white/40 mb-5">Enter total IEEPA tariff duties paid (not total import value).</p>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-lg">$</span>
            <input
              type="text"
              value={customDuties}
              onChange={(e) => setCustomDuties(e.target.value.replace(/[^0-9.,]/g, ""))}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-4 text-2xl text-white outline-none focus:border-[#c4a050]/40 font-display"
              placeholder="500,000"
              autoFocus
            />
          </div>
          {dutiesAmount > 0 && (
            <div className="text-center text-sm text-white/40 mb-4">
              That&apos;s approximately <strong className="text-green-400">{fmt$(estimatedRefund)}</strong> in potential refunds
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep("product")} className="px-4 py-3 rounded-xl border border-white/10 text-sm text-white/50 hover:text-white/70 transition">←</button>
            <button
              onClick={() => dutiesAmount > 0 && setStep("timing")}
              disabled={dutiesAmount <= 0}
              className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-30"
              style={{ background: dutiesAmount > 0 ? "#c4a050" : undefined, color: dutiesAmount > 0 ? "#000" : undefined }}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {/* Step 3: When were duties paid? */}
      {step === "timing" && (
        <>
          <h2 className="font-display text-xl mb-1" style={{ color: "#c4a050" }}>When were these duties paid?</h2>
          <p className="text-sm text-white/50 mb-5">This affects which CAPE phase your entries fall under.</p>
          <div className="space-y-2 mb-4">
            {ENTRY_PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => { setSelectedPeriod(p); setStep("result"); }}
                className="w-full text-left px-4 py-3 rounded-xl border border-white/10 text-sm hover:border-white/20 hover:bg-white/[0.02] transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white/80 font-medium">{p.label}</span>
                  <span className="text-[10px] text-white/30">{p.phase}</span>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep("duties")} className="text-xs text-white/40 hover:text-white/60">← Back</button>
        </>
      )}

      {/* Step 4: Results — show BEFORE asking for info */}
      {step === "result" && (
        <>
          <h2 className="font-display text-xl mb-4" style={{ color: "#c4a050" }}>Your Estimated Recovery</h2>

          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6 mb-4">
            <div className="text-center">
              <div className="font-display text-4xl text-green-400 mb-1">{fmt$(totalRecovery)}</div>
              <div className="text-xs text-white/40">Estimated total recovery (refund + interest)</div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-green-500/10">
              <div className="text-center">
                <div className="text-lg text-green-400 font-semibold">{fmt$(estimatedRefund)}</div>
                <div className="text-[10px] text-white/30">Duty Refund</div>
              </div>
              <div className="text-center">
                <div className="text-lg text-green-400 font-semibold">{fmt$(estimatedInterest)}</div>
                <div className="text-[10px] text-white/30">Accrued Interest</div>
              </div>
            </div>
          </div>

          {/* Urgency + timeline */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
              <span className="text-red-400 text-sm">⚡</span>
              <span className="text-xs text-red-400">{selectedPeriod?.urgency} — {fmt$(dailyInterest)}/day in interest accruing</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <span className="text-white/30 text-sm">📋</span>
              <span className="text-xs text-white/40">{selectedCategory?.label} · HTS Chapter {selectedCategory?.code} · {selectedPeriod?.phase}</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <span className="text-white/30 text-sm">⏱️</span>
              <span className="text-xs text-white/40">Typical processing: 60-90 days through CBP&apos;s CAPE portal</span>
            </div>
          </div>

          <button
            onClick={() => setStep("contact")}
            className="w-full py-3.5 rounded-xl font-semibold text-sm text-black"
            style={{ background: "#c4a050" }}
          >
            Claim Your Refund — Free Assessment →
          </button>
          <button onClick={() => setStep("timing")} className="w-full mt-2 py-2 text-xs text-white/40 hover:text-white/60">← Back</button>
        </>
      )}

      {/* Step 5: Contact info */}
      {step === "contact" && (
        <>
          <h2 className="font-display text-xl mb-1" style={{ color: "#c4a050" }}>Last Step — Your Details</h2>
          <p className="text-sm text-white/50 mb-1">Recovery estimate: <strong className="text-green-400">{fmt$(totalRecovery)}</strong></p>
          <p className="text-sm text-white/40 mb-5">A specialist will review your eligibility within 24 hours. No obligation.</p>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-sm mb-4">{error}</div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Company Name *</label>
              <input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="Acme Imports LLC" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Your Name *</label>
              <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="Jane Smith" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="jane@acmeimports.com" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="(555) 123-4567" />
            </div>
          </div>

          <button onClick={submit} disabled={saving} className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm text-black disabled:opacity-50" style={{ background: "#c4a050" }}>
            {saving ? "Submitting..." : "Request Free Assessment"}
          </button>
          <button onClick={() => setStep("result")} className="w-full mt-2 py-2 text-xs text-white/40 hover:text-white/60">← Back to estimate</button>
        </>
      )}

      {/* Done */}
      {step === "done" && (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="font-display text-xl mb-2" style={{ color: "#c4a050" }}>Assessment Requested</h2>
          <p className="text-sm text-white/60 mb-2">
            Estimated recovery: <strong className="text-green-400">{fmt$(totalRecovery)}</strong>
          </p>
          <p className="text-sm text-white/50 mb-4">
            A tariff recovery specialist will contact you within 24 hours to review your eligibility and outline next steps.
          </p>
          <div className="text-xs text-white/30 space-y-1">
            <p>📋 {selectedCategory?.label} · HTS {selectedCategory?.code}</p>
            <p>📅 Entry period: {selectedPeriod?.label}</p>
            <p>⏱️ Expected processing: 60-90 days via CAPE</p>
          </div>
        </div>
      )}
    </div>
  );
}
