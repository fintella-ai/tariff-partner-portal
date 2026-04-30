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
  utmParams?: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    utm_term: string | null;
    utm_adgroup: string | null;
  };
}

export default function RecoverForm({ partnerCode, utmParams }: Props) {
  const [step, setStep] = useState<"product" | "duties" | "timing" | "result" | "contact" | "not_qualified" | "done">("product");
  const [selectedCategory, setSelectedCategory] = useState<typeof HTS_CATEGORIES[0] | null>(null);
  const [customDuties, setCustomDuties] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<typeof ENTRY_PERIODS[0] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qualificationResult, setQualificationResult] = useState<{ qualified: boolean; reason: string | null } | null>(null);
  const [form, setForm] = useState({
    companyName: "", contactName: "", email: "", phone: "",
    title: "", city: "", state: "", importerOfRecord: "", ein: "",
    businessEntityType: "", importsGoods: "", importCountries: "",
    annualImportValue: "", affiliateNotes: "",
  });

  const dutiesAmount = customDuties ? parseFloat(customDuties.replace(/[^0-9.]/g, "")) || 0 : 0;
  const effectiveRate = selectedCategory?.rate || 0.20;
  const estimatedRefund = Math.round(dutiesAmount * 0.85);
  const estimatedInterest = Math.round(dutiesAmount * 0.07 * (selectedPeriod?.months || 12) / 12);
  const totalRecovery = estimatedRefund + estimatedInterest;
  const dailyInterest = Math.round(dutiesAmount * 0.07 / 365);

  function checkQualification(): { qualified: boolean; reason: string | null } {
    if (dutiesAmount > 0 && dutiesAmount < 10000) {
      return { qualified: false, reason: "low_duties" };
    }
    const av = form.annualImportValue;
    if (av === "Under $1,500,000") {
      return { qualified: false, reason: "low_value" };
    }
    const ig = form.importsGoods;
    if (ig && ig.startsWith("No")) {
      return { qualified: false, reason: "no_imports" };
    }
    const ior = form.importerOfRecord;
    if (ior && ior.startsWith("A third party")) {
      return { qualified: false, reason: "no_ior" };
    }
    return { qualified: true, reason: null };
  }

  async function submit() {
    if (!form.companyName.trim() || !form.contactName.trim() || !form.email.trim() || !form.city.trim() || !form.state.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const qual = checkQualification();
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
          utmSource: utmParams?.utm_source || null,
          utmMedium: utmParams?.utm_medium || null,
          utmCampaign: utmParams?.utm_campaign || null,
          utmTerm: utmParams?.utm_term || null,
          utmAdGroup: utmParams?.utm_adgroup || null,
          qualified: qual.qualified,
          disqualifyReason: qual.reason,
        }),
      });
      if (res.ok) {
        setQualificationResult(qual);
        if (!qual.qualified) {
          setStep("not_qualified");
          return;
        }
        if (typeof window !== "undefined" && (window as any).gtag) {
          (window as any).gtag("event", "conversion", {
            send_to: process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL || undefined,
            value: totalRecovery,
            currency: "USD",
          });
        }
        setStep("done");
      } else {
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
      {step !== "done" && step !== "not_qualified" && (
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
            {/* Row 1: Name + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Your Full Name *</label>
                <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Mobile Phone Number *</label>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="(555) 123-4567" />
              </div>
            </div>
            {/* Row 2: Email */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Business Email Address *</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="jane@acmeimports.com" />
            </div>
            {/* Row 3: Service + Title */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Service of Interest</label>
                <div className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/60">Tariff Refund Support</div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Your Business Title</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="CEO, Owner, Import Manager..." />
              </div>
            </div>
            {/* Row 4: Affiliate Notes */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Affiliate Notes</label>
              <textarea value={form.affiliateNotes} onChange={(e) => setForm((f) => ({ ...f, affiliateNotes: e.target.value }))} rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40 resize-y" placeholder="Any additional notes..." />
            </div>

            <div className="font-display text-sm mt-2 mb-1" style={{ color: "#c4a050" }}>Business Details</div>

            {/* Row 5: Legal Entity */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Legal Entity / Business Name *</label>
              <input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="Acme Imports LLC" />
            </div>
            {/* Row 6: City + State */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">City *</label>
                <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="Los Angeles" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">State *</label>
                <select value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40">
                  <option value="" className="bg-[#0a0e1a]">Select...</option>
                  {["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"].map((s) => (
                    <option key={s} value={s} className="bg-[#0a0e1a]">{s}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Row 7: EIN + Entity Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">EIN (optional)</label>
                <input value={form.ein} onChange={(e) => setForm((f) => ({ ...f, ein: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40" placeholder="12-3456789" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Business Entity Type *</label>
                <select value={form.businessEntityType} onChange={(e) => setForm((f) => ({ ...f, businessEntityType: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40">
                  <option value="" className="bg-[#0a0e1a]">Select...</option>
                  <option value="Sole Proprietorship" className="bg-[#0a0e1a]">Sole Proprietorship</option>
                  <option value="General Partnership" className="bg-[#0a0e1a]">General Partnership</option>
                  <option value="Limited Liability Company (LLC)" className="bg-[#0a0e1a]">Limited Liability Company (LLC)</option>
                  <option value="S Corporation" className="bg-[#0a0e1a]">S Corporation</option>
                  <option value="C Corporation" className="bg-[#0a0e1a]">C Corporation</option>
                  <option value="Limited Partnership (LP)" className="bg-[#0a0e1a]">Limited Partnership (LP)</option>
                  <option value="Nonprofit Corporation" className="bg-[#0a0e1a]">Nonprofit Corporation</option>
                  <option value="Professional Corporation (PC)" className="bg-[#0a0e1a]">Professional Corporation (PC)</option>
                </select>
              </div>
            </div>
            {/* Row 8: Import goods + Import countries */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Import Goods into the US *</label>
                <select value={form.importsGoods} onChange={(e) => setForm((f) => ({ ...f, importsGoods: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40">
                  <option value="" className="bg-[#0a0e1a]">Select...</option>
                  <option value="Yes - we import goods into the U.S." className="bg-[#0a0e1a]">Yes – we import goods into the U.S.</option>
                  <option value="No - goods are imported on our behalf" className="bg-[#0a0e1a]">No – goods are imported on our behalf</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Countries You Import From *</label>
                <select value={form.importCountries} onChange={(e) => setForm((f) => ({ ...f, importCountries: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40">
                  <option value="" className="bg-[#0a0e1a]">Select...</option>
                  <option value="China" className="bg-[#0a0e1a]">China</option>
                  <option value="Canada" className="bg-[#0a0e1a]">Canada</option>
                  <option value="Mexico" className="bg-[#0a0e1a]">Mexico</option>
                  <option value="European Union" className="bg-[#0a0e1a]">European Union</option>
                  <option value="Asia-Pacific (Vietnam, Taiwan, India, etc.)" className="bg-[#0a0e1a]">Asia-Pacific (Vietnam, Taiwan, India, etc.)</option>
                  <option value="Multiple Countries" className="bg-[#0a0e1a]">Multiple Countries</option>
                </select>
              </div>
            </div>
            {/* Row 9: Annual Import Value + Importer of Record */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Annual Import Value *</label>
                <select value={form.annualImportValue} onChange={(e) => setForm((f) => ({ ...f, annualImportValue: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40">
                  <option value="" className="bg-[#0a0e1a]">Select...</option>
                  <option value="Under $1,500,000" className="bg-[#0a0e1a]">Under $1,500,000</option>
                  <option value="$1,500,000 - $3,000,000 per year" className="bg-[#0a0e1a]">$1,500,000 – $3,000,000 per year</option>
                  <option value="$3,000,001 - $10,000,000 per year" className="bg-[#0a0e1a]">$3,000,001 – $10,000,000 per year</option>
                  <option value="$10,000,000+ per year" className="bg-[#0a0e1a]">$10,000,000+ per year</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Importer of Record *</label>
                <select value={form.importerOfRecord} onChange={(e) => setForm((f) => ({ ...f, importerOfRecord: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40">
                  <option value="" className="bg-[#0a0e1a]">Select...</option>
                  <option value="We are the Importer of Record (we use a customs broker)" className="bg-[#0a0e1a]">We are the Importer of Record (we use a customs broker)</option>
                  <option value="A third party imports on our behalf (FedEx, UPS, DHL, supplier, etc.)" className="bg-[#0a0e1a]">A third party imports on our behalf (FedEx, UPS, DHL, supplier, etc.)</option>
                  <option value="Not sure" className="bg-[#0a0e1a]">Not sure</option>
                </select>
              </div>
            </div>
          </div>

          <button onClick={submit} disabled={saving} className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm text-black disabled:opacity-50" style={{ background: "#c4a050" }}>
            {saving ? "Submitting..." : "Request Free Assessment"}
          </button>
          <button onClick={() => setStep("result")} className="w-full mt-2 py-2 text-xs text-white/40 hover:text-white/60">← Back to estimate</button>
        </>
      )}

      {/* Not qualified — soft rejection */}
      {step === "not_qualified" && (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">📋</div>
          <h2 className="font-display text-xl mb-2" style={{ color: "#c4a050" }}>Thank You for Your Interest</h2>
          <p className="text-sm text-white/60 mb-4">
            Based on your import profile, you may not meet the minimum threshold for the IEEPA tariff refund program at this time.
          </p>
          <p className="text-sm text-white/50 mb-6">
            We&apos;ve saved your information and will reach out if eligibility criteria change. You can also contact us directly for a manual review.
          </p>
          <a href="mailto:support@fintella.partners" className="inline-block px-6 py-3 rounded-xl font-semibold text-sm text-black" style={{ background: "#c4a050" }}>
            Contact Us for Manual Review
          </a>
        </div>
      )}

      {/* Done — embedded Frost Law form with pre-filled data */}
      {step === "done" && (() => {
        const names = form.contactName.trim().split(/\s+/);
        const p: Record<string, string> = {};
        if (names[0]) p.first_name = names[0];
        if (names.length > 1) p.last_name = names.slice(1).join(" ");
        if (form.email) p.email = form.email;
        if (form.phone) p.phone = form.phone;
        if (form.companyName) p.company = form.companyName;
        if (form.title) p.jobtitle = form.title;
        if (form.city) p.city = form.city;
        if (form.state) p.state = form.state;
        if (form.ein) p.company_ein = form.ein;
        p.service_of_interest = "Tariff Refund Support";
        if (form.businessEntityType) p.company_business_entity = form.businessEntityType;
        if (form.importsGoods) p.import_good_to_us = form.importsGoods;
        if (form.importCountries) p.import_countries = form.importCountries;
        if (form.annualImportValue) p.annual_import_value = form.annualImportValue;
        if (form.importerOfRecord) p.importer_of_record = form.importerOfRecord;
        if (form.affiliateNotes) p.affiliate_notes = form.affiliateNotes;
        if (partnerCode) p.utm_content = partnerCode;
        const frostUrl = `https://referral.frostlawaz.com/l/ANNEXATIONPR/?${new URLSearchParams(p).toString()}`;
        return (
          <div>
            <div className="rounded-xl border border-white/10 overflow-hidden relative" style={{ background: "#fff", height: 1400 }}>
              <iframe
                src={frostUrl}
                className="w-full border-0 absolute"
                title="Complete Your Filing"
                allow="camera; microphone; geolocation"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation"
                style={{ top: -680, left: 0, width: "100%", height: 2800 }}
              />
            </div>
            <button onClick={() => setStep("contact")} className="w-full mt-3 py-2 text-xs text-white/40 hover:text-white/60">← Back to edit details</button>
          </div>
        );
      })()}
    </div>
  );
}
