"use client";

import { useState } from "react";

const RESOURCES = [
  {
    id: "cape-guide",
    icon: "📘",
    title: "CAPE System Guide",
    description: "Why you need legal counsel to navigate CBP's CAPE refund portal and avoid costly filing errors.",
    file: "/resources/cape-system-guide.pdf",
  },
  {
    id: "value-add",
    icon: "📋",
    title: "Our Value in Your Journey",
    description: "How our legal team adds value at every stage of the tariff recovery process — from filing to refund.",
    file: "/resources/our-value-add.pdf",
  },
  {
    id: "legal-counsel",
    icon: "⚖️",
    title: "Why Legal Counsel Matters",
    description: "The risks of filing IEEPA recovery claims without legal representation and how to protect your refund.",
    file: "/resources/why-legal-counsel.pdf",
  },
];

interface Props {
  partnerCode: string | null;
}

export default function GatedResources({ partnerCode }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [selectedResource, setSelectedResource] = useState<typeof RESOURCES[0] | null>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleDownloadClick(resource: typeof RESOURCES[0]) {
    if (unlocked) {
      window.open(resource.file, "_blank");
      return;
    }
    setSelectedResource(resource);
    setError("");
  }

  async function submitAndDownload() {
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
      const res = await fetch("/api/recover/resource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          company: form.company.trim() || null,
          resourceId: selectedResource?.id,
          resourceTitle: selectedResource?.title,
          partnerCode,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Something went wrong" }));
        setError(data.error || "Something went wrong.");
        return;
      }
      setUnlocked(true);
      setSelectedResource(null);
      if (selectedResource) {
        window.open(selectedResource.file, "_blank");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="font-display text-2xl text-center mb-3" style={{ color: "#c4a050" }}>Free Resources</h2>
        <p className="text-sm text-white/40 text-center mb-10">
          Download these guides to understand the IEEPA tariff recovery process.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {RESOURCES.map((r) => (
            <button
              key={r.id}
              onClick={() => handleDownloadClick(r)}
              className="group p-6 rounded-2xl border border-white/10 hover:border-[#c4a050]/30 hover:bg-[#c4a050]/[0.03] transition-all text-left"
            >
              <div className="text-3xl mb-3">{r.icon}</div>
              <h3 className="font-semibold text-sm text-white/90 mb-2 group-hover:text-[#c4a050] transition">{r.title}</h3>
              <p className="text-xs text-white/40 mb-3">{r.description}</p>
              <span className="text-xs text-[#c4a050]/70 font-medium">
                {unlocked ? "Download PDF →" : "🔒 Download PDF →"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Gate modal */}
      {selectedResource && !unlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-[#0c1220] border border-white/10 rounded-2xl p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="text-3xl mb-2">{selectedResource.icon}</div>
              <h3 className="font-display text-lg" style={{ color: "#c4a050" }}>{selectedResource.title}</h3>
              <p className="text-xs text-white/40 mt-2">Enter your details to download this free guide.</p>
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
                  placeholder="Jane Smith"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
                  placeholder="jane@acmeimports.com"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Company</label>
                <input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
                  placeholder="Acme Imports LLC"
                />
              </div>
            </div>

            <button
              onClick={submitAndDownload}
              disabled={saving}
              className="w-full mt-5 py-3.5 rounded-xl font-semibold text-sm text-black disabled:opacity-50"
              style={{ background: "#c4a050" }}
            >
              {saving ? "Processing..." : "Download Free Guide"}
            </button>
            <button
              onClick={() => setSelectedResource(null)}
              className="w-full mt-2 py-2 text-xs text-white/40 hover:text-white/60"
            >
              Cancel
            </button>

            <p className="text-[10px] text-white/20 text-center mt-4">
              We&apos;ll send you the guide and occasional tariff recovery updates. Unsubscribe anytime.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
