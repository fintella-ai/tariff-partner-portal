"use client";

import { useState } from "react";
import { fmt$ } from "@/lib/format";

interface CommissionOverride {
  partnerCode: string;
  partnerName: string;
  l1Rate: number;
  l2Rate: number;
  l3Rate: number;
  l3Enabled: boolean;
}

const DEFAULT_RATES = { l1: 0.2, l2: 0.05, l3: 0 };

const DEMO_OVERRIDES: CommissionOverride[] = [
  {
    partnerCode: "TRLN-SM2024",
    partnerName: "Sarah Mitchell",
    l1Rate: 0.25,
    l2Rate: 0.07,
    l3Rate: 0.02,
    l3Enabled: true,
  },
  {
    partnerCode: "TRLN-JR2024",
    partnerName: "James Robertson",
    l1Rate: 0.22,
    l2Rate: 0.05,
    l3Rate: 0,
    l3Enabled: false,
  },
  {
    partnerCode: "TRLN-PN2025",
    partnerName: "Priya Nair",
    l1Rate: 0.2,
    l2Rate: 0.06,
    l3Rate: 0.01,
    l3Enabled: true,
  },
];

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export default function CommissionManagementPage() {
  const [overrides, setOverrides] = useState<CommissionOverride[]>(DEMO_OVERRIDES);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    partnerCode: "",
    partnerName: "",
    l1Rate: "20",
    l2Rate: "5",
    l3Rate: "0",
    l3Enabled: false,
  });

  function handleAdd() {
    if (!form.partnerCode.trim()) return;
    const newOverride: CommissionOverride = {
      partnerCode: form.partnerCode.trim(),
      partnerName: form.partnerName.trim() || form.partnerCode.trim(),
      l1Rate: Number(form.l1Rate) / 100,
      l2Rate: Number(form.l2Rate) / 100,
      l3Rate: Number(form.l3Rate) / 100,
      l3Enabled: form.l3Enabled,
    };
    setOverrides((prev) => [...prev, newOverride]);
    setForm({ partnerCode: "", partnerName: "", l1Rate: "20", l2Rate: "5", l3Rate: "0", l3Enabled: false });
    setShowForm(false);
  }

  function handleRemove(code: string) {
    setOverrides((prev) => prev.filter((o) => o.partnerCode !== code));
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">
        Commission Management
      </h2>
      <p className="font-body text-sm text-white/40 mb-6">
        Configure default commission rates and partner-specific overrides.
      </p>

      {/* Default Rates */}
      <div className="card p-5 mb-8">
        <h3 className="font-display text-base font-semibold mb-4">
          Default Rates
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Level 1 (Direct)", rate: DEFAULT_RATES.l1 },
            { label: "Level 2 (Upline)", rate: DEFAULT_RATES.l2 },
            { label: "Level 3 (Extended)", rate: DEFAULT_RATES.l3 },
          ].map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3"
            >
              <div>
                <p className="font-body text-xs text-white/40">{r.label}</p>
                <p className="font-display text-lg font-bold text-brand-gold">
                  {pct(r.rate)}
                </p>
              </div>
              <button
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 transition cursor-not-allowed"
                title="Editing default rates coming soon"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Partner Overrides */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold">
            Partner Overrides
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
          >
            {showForm ? "Cancel" : "Add Override"}
          </button>
        </div>

        {/* Inline add form */}
        {showForm && (
          <div className="mb-6 p-4 rounded-lg bg-white/5 border border-white/10 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-body text-xs text-white/40 mb-1">
                  Partner Code
                </label>
                <input
                  type="text"
                  value={form.partnerCode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, partnerCode: e.target.value }))
                  }
                  placeholder="TRLN-XX0000"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-body text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-gold/60 transition"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-white/40 mb-1">
                  Partner Name
                </label>
                <input
                  type="text"
                  value={form.partnerName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, partnerName: e.target.value }))
                  }
                  placeholder="Full name"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-body text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-gold/60 transition"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block font-body text-xs text-white/40 mb-1">
                  L1 Rate %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.l1Rate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, l1Rate: e.target.value }))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-body text-sm text-white focus:outline-none focus:border-brand-gold/60 transition"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-white/40 mb-1">
                  L2 Rate %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.l2Rate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, l2Rate: e.target.value }))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-body text-sm text-white focus:outline-none focus:border-brand-gold/60 transition"
                />
              </div>
              <div>
                <label className="block font-body text-xs text-white/40 mb-1">
                  L3 Rate %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.l3Rate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, l3Rate: e.target.value }))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-body text-sm text-white focus:outline-none focus:border-brand-gold/60 transition"
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  id="l3-enabled"
                  checked={form.l3Enabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, l3Enabled: e.target.checked }))
                  }
                  className="rounded border-white/20 bg-white/5 text-brand-gold focus:ring-brand-gold/50"
                />
                <label
                  htmlFor="l3-enabled"
                  className="font-body text-xs text-white/60"
                >
                  L3 Enabled
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleAdd}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition"
              >
                Save Override
              </button>
            </div>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3 text-right">L1 Rate</th>
                <th className="px-4 py-3 text-right">L2 Rate</th>
                <th className="px-4 py-3 text-right">L3 Rate</th>
                <th className="px-4 py-3 text-center">L3 Enabled</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr
                  key={o.partnerCode}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition"
                >
                  <td className="px-4 py-3 text-white">{o.partnerName}</td>
                  <td className="px-4 py-3 text-white/70 font-mono text-xs">
                    {o.partnerCode}
                  </td>
                  <td className="px-4 py-3 text-right text-brand-gold font-medium">
                    {pct(o.l1Rate)}
                  </td>
                  <td className="px-4 py-3 text-right text-white/70">
                    {pct(o.l2Rate)}
                  </td>
                  <td className="px-4 py-3 text-right text-white/70">
                    {pct(o.l3Rate)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {o.l3Enabled ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/40">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="px-3 py-1.5 rounded-md text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 transition cursor-not-allowed">
                        Edit
                      </button>
                      <button
                        onClick={() => handleRemove(o.partnerCode)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {overrides.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-white/30"
                  >
                    No partner overrides configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden space-y-4">
          {overrides.map((o) => (
            <div
              key={o.partnerCode}
              className="rounded-lg bg-white/5 p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-white">{o.partnerName}</p>
                  <p className="text-xs text-white/50 font-mono mt-0.5">
                    {o.partnerCode}
                  </p>
                </div>
                {o.l3Enabled ? (
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                    L3 On
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/40">
                    L3 Off
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-white/40">L1 Rate</p>
                  <p className="text-brand-gold font-medium">{pct(o.l1Rate)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">L2 Rate</p>
                  <p className="text-white/70">{pct(o.l2Rate)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">L3 Rate</p>
                  <p className="text-white/70">{pct(o.l3Rate)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <button className="flex-1 text-center px-3 py-2 rounded-md text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 transition cursor-not-allowed">
                  Edit
                </button>
                <button
                  onClick={() => handleRemove(o.partnerCode)}
                  className="flex-1 text-center px-3 py-2 rounded-md text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {overrides.length === 0 && (
            <div className="py-12 text-center text-white/30 font-body text-sm">
              No partner overrides configured.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
