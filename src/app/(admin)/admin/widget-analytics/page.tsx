"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface WidgetVariant {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  isActive: boolean;
  weight: number;
  createdAt: string;
  _count: { impressions: number };
}

interface FunnelRow {
  variantName: string;
  loaded: number;
  opened: number;
  calc_started: number;
  calc_completed: number;
  referral_started: number;
  referral_submitted: number;
  chat_opened: number;
}

type DateRange = "7d" | "30d" | "all";

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function WidgetAnalyticsPage() {
  const [variants, setVariants] = useState<WidgetVariant[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"analytics" | "manage">("analytics");

  // Auto-optimize state
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);

  // Variant editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", weight: 50, config: "{}", isActive: true });
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, fRes] = await Promise.all([
        fetch("/api/admin/widget-analytics/variants"),
        fetch(`/api/admin/widget-analytics/funnel?range=${dateRange}`),
      ]);
      if (vRes.ok) {
        const vData = await vRes.json();
        setVariants(vData.variants || []);
        setAutoOptimize(!!vData.autoOptimize);
      }
      if (fRes.ok) {
        const fData = await fRes.json();
        setFunnel(fData.funnel || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Toggle auto-optimize ── */
  const toggleAutoOptimize = async () => {
    setTogglingAuto(true);
    try {
      const res = await fetch("/api/admin/widget-analytics/variants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoOptimize: !autoOptimize }),
      });
      if (res.ok) {
        setAutoOptimize(!autoOptimize);
      }
    } finally {
      setTogglingAuto(false);
    }
  };

  /* ── Save variant (create or update) ── */
  const saveVariant = async (isNew: boolean) => {
    setSaving(true);
    try {
      let parsedConfig: Record<string, unknown> = {};
      try {
        parsedConfig = JSON.parse(editForm.config);
      } catch {
        alert("Invalid JSON in config field");
        setSaving(false);
        return;
      }
      const body = {
        id: isNew ? undefined : editingId,
        name: editForm.name,
        description: editForm.description || null,
        weight: editForm.weight,
        config: parsedConfig,
        isActive: editForm.isActive,
      };
      const res = await fetch("/api/admin/widget-analytics/variants", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingId(null);
        setShowCreate(false);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  /* ── Funnel helpers ── */
  const funnelSteps: { key: keyof FunnelRow; label: string; color: string }[] = [
    { key: "loaded", label: "Loaded", color: "#6366f1" },
    { key: "opened", label: "Opened", color: "#8b5cf6" },
    { key: "calc_started", label: "Calc Started", color: "#c4a050" },
    { key: "calc_completed", label: "Calc Done", color: "#f59e0b" },
    { key: "referral_started", label: "Referral Start", color: "#22c55e" },
    { key: "referral_submitted", label: "Referral Submit", color: "#10b981" },
    { key: "chat_opened", label: "Chat Opened", color: "#3b82f6" },
  ];

  const maxLoaded = Math.max(...funnel.map((f) => f.loaded), 1);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">Widget A/B Testing</h2>
          <p className="font-body text-sm theme-text-muted mt-1">
            Compare widget variant performance and manage experiments
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("analytics")}
            className={`px-4 py-2 rounded-lg font-body text-sm transition-colors ${
              tab === "analytics"
                ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                : "theme-text-secondary hover:bg-brand-gold/5 border border-transparent"
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`px-4 py-2 rounded-lg font-body text-sm transition-colors ${
              tab === "manage"
                ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                : "theme-text-secondary hover:bg-brand-gold/5 border border-transparent"
            }`}
          >
            Manage Variants
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "analytics" ? (
        <>
          {/* ── Date range filter ── */}
          <div className="flex gap-2">
            {([["7d", "Last 7 days"], ["30d", "Last 30 days"], ["all", "All time"]] as const).map(
              ([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDateRange(val)}
                  className={`px-3 py-1.5 rounded-lg font-body text-xs transition-colors ${
                    dateRange === val
                      ? "bg-brand-gold/15 text-brand-gold border border-brand-gold/30"
                      : "theme-text-muted hover:theme-text-secondary border border-[var(--app-border)]"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Variants", value: variants.length },
              { label: "Active Variants", value: variants.filter((v) => v.isActive).length },
              { label: "Total Impressions", value: funnel.reduce((s, f) => s + f.loaded, 0) },
              {
                label: "Avg Conversion",
                value: (() => {
                  const totalLoaded = funnel.reduce((s, f) => s + f.loaded, 0);
                  const totalSubmitted = funnel.reduce((s, f) => s + f.referral_submitted, 0);
                  return totalLoaded > 0
                    ? `${((totalSubmitted / totalLoaded) * 100).toFixed(1)}%`
                    : "0%";
                })(),
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl p-4"
                style={{
                  background: "var(--app-bg-secondary)",
                  border: "1px solid var(--app-border)",
                }}
              >
                <div className="font-body text-xs theme-text-muted mb-1">{card.label}</div>
                <div className="font-display text-xl font-bold">{card.value}</div>
              </div>
            ))}
          </div>

          {/* ── Funnel comparison ── */}
          {funnel.length === 0 ? (
            <div
              className="rounded-xl p-8 text-center"
              style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
            >
              <p className="font-body text-sm theme-text-muted">
                No impression data yet. Widget variants need to be loaded by users to generate analytics.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl p-6 space-y-6"
              style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
            >
              <h3 className="font-display text-lg font-bold">Funnel Comparison</h3>

              {funnel.map((row) => {
                const convRate =
                  row.loaded > 0
                    ? ((row.referral_submitted / row.loaded) * 100).toFixed(1)
                    : "0.0";
                return (
                  <div key={row.variantName} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-body text-sm font-semibold">
                        {row.variantName}
                      </div>
                      <div className="font-body text-xs theme-text-muted">
                        Conversion: <span className="text-brand-gold font-semibold">{convRate}%</span>
                      </div>
                    </div>

                    {/* Bar chart rows */}
                    <div className="space-y-1.5">
                      {funnelSteps.map((step) => {
                        const val = row[step.key] as number;
                        const pct = maxLoaded > 0 ? (val / maxLoaded) * 100 : 0;
                        return (
                          <div key={step.key} className="flex items-center gap-3">
                            <div className="font-body text-[11px] theme-text-muted w-24 text-right shrink-0">
                              {step.label}
                            </div>
                            <div
                              className="flex-1 h-5 rounded-md overflow-hidden"
                              style={{ background: "var(--app-bg)" }}
                            >
                              <div
                                className="h-full rounded-md transition-all duration-500"
                                style={{
                                  width: `${Math.max(pct, val > 0 ? 2 : 0)}%`,
                                  background: step.color,
                                }}
                              />
                            </div>
                            <div className="font-body text-xs font-semibold w-12 text-right shrink-0">
                              {val.toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Per-variant detail table ── */}
          {funnel.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
            >
              <div className="p-4 border-b" style={{ borderColor: "var(--app-border)" }}>
                <h3 className="font-display text-lg font-bold">Detailed Metrics</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full font-body text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--app-border)" }}>
                      <th className="text-left p-3 theme-text-muted font-medium">Variant</th>
                      {funnelSteps.map((s) => (
                        <th key={s.key} className="text-right p-3 theme-text-muted font-medium">
                          {s.label}
                        </th>
                      ))}
                      <th className="text-right p-3 theme-text-muted font-medium">Conv %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.map((row) => (
                      <tr
                        key={row.variantName}
                        className="border-b last:border-0 hover:bg-brand-gold/5 transition-colors"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <td className="p-3 font-semibold">{row.variantName}</td>
                        {funnelSteps.map((s) => (
                          <td key={s.key} className="p-3 text-right">
                            {(row[s.key] as number).toLocaleString()}
                          </td>
                        ))}
                        <td className="p-3 text-right font-semibold text-brand-gold">
                          {row.loaded > 0
                            ? ((row.referral_submitted / row.loaded) * 100).toFixed(1)
                            : "0.0"}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── Manage Variants tab ── */
        <div className="space-y-4">
          {/* ── Auto-Optimize toggle ── */}
          <div
            className="rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold">Auto-Optimize</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    autoOptimize
                      ? "bg-green-500/15 text-green-400"
                      : "bg-neutral-500/15 theme-text-muted"
                  }`}
                >
                  {autoOptimize ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="font-body text-xs theme-text-muted mt-1">
                {autoOptimize
                  ? "Weights are automatically optimized weekly via Thompson sampling based on referral conversion rates."
                  : "Variant weights are set manually. Enable to let the system auto-adjust weights based on performance."}
              </p>
            </div>
            <button
              onClick={toggleAutoOptimize}
              disabled={togglingAuto}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                autoOptimize ? "bg-brand-gold" : "bg-neutral-600"
              }`}
              role="switch"
              aria-checked={autoOptimize}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoOptimize ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => {
                setShowCreate(true);
                setEditingId(null);
                setEditForm({ name: "", description: "", weight: 50, config: '{"defaultTab":"dashboard"}', isActive: true });
              }}
              className="px-4 py-2 rounded-lg font-body text-sm bg-brand-gold text-black font-semibold hover:bg-brand-gold/90 transition-colors"
            >
              + Create Variant
            </button>
          </div>

          {/* Create / Edit form */}
          {(showCreate || editingId) && (
            <div
              className="rounded-xl p-6 space-y-4"
              style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
            >
              <h3 className="font-display text-lg font-bold">
                {editingId ? "Edit Variant" : "Create Variant"}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-body text-xs theme-text-muted block mb-1">Name (unique slug)</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg font-body text-sm"
                    style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="e.g. calculator-first"
                    disabled={!!editingId}
                  />
                </div>
                <div>
                  <label className="font-body text-xs theme-text-muted block mb-1">Weight (0-100)</label>
                  {autoOptimize ? (
                    <div
                      className="w-full px-3 py-2 rounded-lg font-body text-xs theme-text-muted italic"
                      style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
                    >
                      Managed by auto-optimizer
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-full px-3 py-2 rounded-lg font-body text-sm"
                      style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
                      value={editForm.weight}
                      onChange={(e) => setEditForm({ ...editForm, weight: parseInt(e.target.value) || 0 })}
                    />
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="font-body text-xs theme-text-muted block mb-1">Description</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg font-body text-sm"
                    style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Short description of this variant"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="font-body text-xs theme-text-muted block mb-1">
                    Config (JSON) -- keys: defaultTab, ctaText, headerStyle, showCalculatorFirst, hideChat, panelWidth, panelHeight
                  </label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg font-body text-sm font-mono"
                    style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
                    value={editForm.config}
                    onChange={(e) => setEditForm({ ...editForm, config: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label className="font-body text-sm">Active</label>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => saveVariant(!editingId)}
                  disabled={saving || !editForm.name}
                  className="px-4 py-2 rounded-lg font-body text-sm bg-brand-gold text-black font-semibold hover:bg-brand-gold/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Create"}
                </button>
                <button
                  onClick={() => { setEditingId(null); setShowCreate(false); }}
                  className="px-4 py-2 rounded-lg font-body text-sm theme-text-secondary hover:bg-brand-gold/5 transition-colors border"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Variants list */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full font-body text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--app-border)" }}>
                    <th className="text-left p-3 theme-text-muted font-medium">Name</th>
                    <th className="text-left p-3 theme-text-muted font-medium">Description</th>
                    <th className="text-right p-3 theme-text-muted font-medium">Weight</th>
                    <th className="text-center p-3 theme-text-muted font-medium">Status</th>
                    <th className="text-right p-3 theme-text-muted font-medium">Impressions</th>
                    <th className="text-right p-3 theme-text-muted font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center theme-text-muted">
                        No variants configured. Create one to start A/B testing.
                      </td>
                    </tr>
                  ) : (
                    variants.map((v) => (
                      <tr
                        key={v.id}
                        className="border-b last:border-0 hover:bg-brand-gold/5 transition-colors"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <td className="p-3 font-semibold">{v.name}</td>
                        <td className="p-3 theme-text-secondary">{v.description || "--"}</td>
                        <td className="p-3 text-right">{v.weight}%</td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              v.isActive
                                ? "bg-green-500/15 text-green-400"
                                : "bg-red-500/15 text-red-400"
                            }`}
                          >
                            {v.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="p-3 text-right">{v._count.impressions.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setEditingId(v.id);
                              setShowCreate(false);
                              setEditForm({
                                name: v.name,
                                description: v.description || "",
                                weight: v.weight,
                                config: JSON.stringify(v.config, null, 2),
                                isActive: v.isActive,
                              });
                            }}
                            className="px-3 py-1 rounded text-xs font-medium text-brand-gold hover:bg-brand-gold/10 transition-colors"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
