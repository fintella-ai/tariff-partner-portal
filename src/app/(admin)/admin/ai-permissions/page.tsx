"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AuditEntry {
  id: string;
  action: string;
  actorEmail: string;
  actorRole: string;
  targetId: string | null;
  details: {
    changes?: Record<string, { old: unknown; new: unknown }>;
    personaId?: string;
    isNew?: boolean;
    resetAll?: boolean;
    deletedCount?: number;
    deletedPersonas?: string[];
  } | null;
  createdAt: string;
}

interface PersonaConfig {
  id: string | null;
  personaId: string;
  enabledTools: string[];
  maxDailyMessages: number;
  maxDailySpend: number;
  systemPromptOverride: string | null;
  isActive: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const PERSONA_META: Record<string, { name: string; role: string; accent: string; desc: string; avatar: string }> = {
  finn: { name: "Finn", role: "Generalist", accent: "#c4a050", desc: "Direct, data-driven. Fast answers.", avatar: "/ai-avatars/finn.png" },
  stella: { name: "Stella", role: "Generalist", accent: "#d8a5a5", desc: "Warm, coaching. Walks you through it.", avatar: "/ai-avatars/stella.png" },
  tara: { name: "Tara", role: "Product Specialist", accent: "#5e7eb8", desc: "Tariff refund expert. Cites sources.", avatar: "/ai-avatars/tara.svg" },
  ollie: { name: "Ollie", role: "Support Specialist", accent: "#4a9d9c", desc: "Portal ops. Troubleshooting.", avatar: "/ai-avatars/ollie.svg" },
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  lookupDeal: "Search partner deals by name/entity",
  lookupCommissions: "View commission ledger entries",
  lookupAgreement: "Check agreement status",
  lookupDownline: "View recruited downline partners",
  create_support_ticket: "Create support tickets",
  start_live_chat: "Transfer to live admin chat",
  offer_schedule_slots: "Show available call slots",
  book_slot: "Book a scheduled call",
  investigate_bug: "Triage portal bug reports",
  initiate_live_transfer: "Bridge live phone calls",
  hand_off: "Transfer to specialist persona",
};

export default function AiPermissionsPage() {
  const [configs, setConfigs] = useState<PersonaConfig[]>([]);
  const [allTools, setAllTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [portalTier, setPortalTier] = useState<string | null>(null); // null = loading
  const [tierLoaded, setTierLoaded] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Load portal tier to check Enterprise gate
  useEffect(() => {
    fetch("/api/admin/portal-tier")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setPortalTier(data?.tier ?? "enterprise"); // fallback: don't lock out
        setTierLoaded(true);
      })
      .catch(() => {
        setPortalTier("enterprise"); // fallback: don't lock out
        setTierLoaded(true);
      });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ai-permissions");
      const data = await res.json();
      setConfigs(data.configs);
      setAllTools(data.allTools);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/ai-permissions/history");
      const data = await res.json();
      setHistory(data.history ?? []);
    } catch { /* ignore */ } finally { setHistoryLoading(false); }
  }, []);

  const updateConfig = async (personaId: string, updates: Partial<PersonaConfig>) => {
    const current = configs.find((c) => c.personaId === personaId);
    if (!current) return;
    setSaving(personaId);
    try {
      const res = await fetch("/api/admin/ai-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...current, ...updates, personaId }),
      });
      if (res.ok) {
        showToast(`${PERSONA_META[personaId]?.name ?? personaId} updated`);
        load();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save");
      }
    } catch { showToast("Failed to save"); } finally { setSaving(null); }
  };

  const toggleTool = (personaId: string, tool: string) => {
    const config = configs.find((c) => c.personaId === personaId);
    if (!config) return;
    const tools = config.enabledTools.includes(tool)
      ? config.enabledTools.filter((t) => t !== tool)
      : [...config.enabledTools, tool];
    updateConfig(personaId, { enabledTools: tools });
  };

  const resetAll = async () => {
    if (!confirm("Reset all AI persona configs to defaults?")) return;
    try {
      await fetch("/api/admin/ai-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      showToast("All configs reset to defaults");
      load();
    } catch { showToast("Failed to reset"); }
  };

  if (loading || !tierLoaded) return (
    <div className="p-6">
      <div className="animate-pulse space-y-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-48 bg-[var(--app-bg-secondary)] rounded-xl" />)}
      </div>
    </div>
  );

  // Enterprise tier gate — show upgrade prompt if not Enterprise
  if (portalTier !== "enterprise") {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div
          className="rounded-2xl border p-8 sm:p-12 text-center"
          style={{
            borderColor: "var(--brand-gold)",
            background: "linear-gradient(135deg, rgba(176,140,48,0.08), rgba(176,140,48,0.02))",
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: "rgba(176,140,48,0.12)" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h1
            className="text-2xl font-bold mb-3"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: "var(--brand-gold)" }}
          >
            AI Governance Suite
          </h1>
          <p className="font-body text-sm text-[var(--app-text-muted)] mb-2 max-w-lg mx-auto">
            Full control over your AI personas — tool permissions, daily budgets,
            custom instructions, and a complete audit trail of every change.
          </p>
          <p className="font-body text-xs text-[var(--app-text-muted)] mb-6">
            Available on the <span className="font-semibold text-[var(--brand-gold)]">Enterprise</span> plan.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-md mx-auto mb-8">
            {[
              { icon: "🔧", label: "Tool Permissions" },
              { icon: "📋", label: "Audit Trail" },
              { icon: "💬", label: "Custom Prompts" },
              { icon: "📊", label: "Daily Limits" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-1 px-3 py-3 rounded-lg border border-[var(--app-border)]"
                style={{ background: "var(--app-card-bg)" }}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-body text-[10px] font-semibold text-[var(--app-text)]">{item.label}</span>
              </div>
            ))}
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 h-12 px-8 rounded-xl font-body text-sm font-semibold transition-all"
            style={{
              background: "var(--brand-gold)",
              color: "#000",
              boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
            }}
          >
            View Enterprise Plans
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--app-text)]">AI Permissions</h1>
          <p className="text-sm text-[var(--app-text-muted)] mt-1">Configure tools, limits, and behavior for each AI persona</p>
        </div>
        <button
          onClick={resetAll}
          className="px-4 py-2 text-sm rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-bg-secondary)] transition"
        >
          Reset to Defaults
        </button>
      </div>

      <div className="space-y-6">
        {configs.map((config) => {
          const meta = PERSONA_META[config.personaId] ?? { name: config.personaId, role: "Unknown", accent: "#888", desc: "", avatar: "" };
          const isSaving = saving === config.personaId;

          return (
            <div
              key={config.personaId}
              className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] overflow-hidden"
              style={{ borderLeftWidth: 4, borderLeftColor: meta.accent }}
            >
              {/* Header */}
              <div className="p-5 flex items-center gap-4">
                <img
                  src={meta.avatar}
                  alt={meta.name}
                  className="w-12 h-12 rounded-full object-cover border-2"
                  style={{ borderColor: meta.accent }}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-[var(--app-text)]">{meta.name}</h2>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${meta.accent}20`, color: meta.accent }}
                    >
                      {meta.role}
                    </span>
                    {isSaving && (
                      <span className="text-xs text-[var(--app-text-muted)] animate-pulse">Saving...</span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--app-text-muted)] mt-0.5">{meta.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--app-text-muted)]">Active</label>
                  <button
                    onClick={() => updateConfig(config.personaId, { isActive: !config.isActive })}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    style={{ background: config.isActive ? meta.accent : "var(--app-bg-secondary)" }}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      style={{ left: config.isActive ? 22 : 2 }}
                    />
                  </button>
                </div>
              </div>

              {/* Tools grid */}
              <div className="px-5 pb-4">
                <h3 className="text-xs font-semibold text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Enabled Tools</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {allTools.map((tool) => {
                    const enabled = config.enabledTools.includes(tool);
                    return (
                      <button
                        key={tool}
                        onClick={() => toggleTool(config.personaId, tool)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition border ${
                          enabled
                            ? "border-[var(--app-border)] bg-[var(--app-bg-secondary)] text-[var(--app-text)]"
                            : "border-transparent bg-transparent text-[var(--app-text-muted)] opacity-50 hover:opacity-70"
                        }`}
                      >
                        <div
                          className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-xs font-bold"
                          style={{
                            background: enabled ? meta.accent : "var(--app-bg-secondary)",
                            color: enabled ? "#fff" : "transparent",
                            border: enabled ? "none" : "1px solid var(--app-border)",
                          }}
                        >
                          {enabled ? "✓" : ""}
                        </div>
                        <div>
                          <div className="font-medium text-xs">{tool}</div>
                          <div className="text-[10px] text-[var(--app-text-muted)]">{TOOL_DESCRIPTIONS[tool] ?? ""}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Limits row */}
              <div className="px-5 pb-4 flex flex-wrap gap-4">
                <div>
                  <label className="text-xs text-[var(--app-text-muted)] block mb-1">Daily Message Limit</label>
                  <input
                    type="number"
                    value={config.maxDailyMessages}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 50;
                      setConfigs((prev) => prev.map((c) => c.personaId === config.personaId ? { ...c, maxDailyMessages: v } : c));
                    }}
                    onBlur={() => updateConfig(config.personaId, { maxDailyMessages: config.maxDailyMessages })}
                    className="w-24 px-3 py-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] text-sm text-[var(--app-text)]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--app-text-muted)] block mb-1">Daily Spend Cap ($)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={config.maxDailySpend}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 5.0;
                      setConfigs((prev) => prev.map((c) => c.personaId === config.personaId ? { ...c, maxDailySpend: v } : c));
                    }}
                    onBlur={() => updateConfig(config.personaId, { maxDailySpend: config.maxDailySpend })}
                    className="w-24 px-3 py-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] text-sm text-[var(--app-text)]"
                  />
                </div>
              </div>

              {/* System prompt override */}
              <div className="px-5 pb-5">
                <button
                  onClick={() => setExpandedPrompt(expandedPrompt === config.personaId ? null : config.personaId)}
                  className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition flex items-center gap-1"
                >
                  <span>{expandedPrompt === config.personaId ? "▼" : "▶"}</span>
                  Custom Instructions Override
                </button>
                {expandedPrompt === config.personaId && (
                  <div className="mt-2">
                    <textarea
                      value={config.systemPromptOverride ?? ""}
                      onChange={(e) => {
                        setConfigs((prev) => prev.map((c) => c.personaId === config.personaId ? { ...c, systemPromptOverride: e.target.value || null } : c));
                      }}
                      onBlur={() => updateConfig(config.personaId, { systemPromptOverride: config.systemPromptOverride })}
                      placeholder="Additional instructions appended to this persona's system prompt..."
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] resize-y"
                    />
                  </div>
                )}
              </div>

              {/* Footer */}
              {config.updatedAt && (
                <div className="px-5 py-2 bg-[var(--app-bg-secondary)] border-t border-[var(--app-border)] text-xs text-[var(--app-text-muted)]">
                  Last updated {new Date(config.updatedAt).toLocaleString()} {config.updatedBy ? `by ${config.updatedBy}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Change History */}
      <div className="mt-8 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] overflow-hidden">
        <button
          onClick={() => {
            const willOpen = !historyOpen;
            setHistoryOpen(willOpen);
            if (willOpen && history.length === 0) loadHistory();
          }}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--app-bg-secondary)] transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--app-text-muted)]">{historyOpen ? "▼" : "▶"}</span>
            <h2 className="text-sm font-semibold text-[var(--app-text)]">Change History</h2>
          </div>
          <span className="text-xs text-[var(--app-text-muted)]">Recent AI permission changes</span>
        </button>

        {historyOpen && (
          <div className="border-t border-[var(--app-border)]">
            {historyLoading ? (
              <div className="p-5 text-sm text-[var(--app-text-muted)] animate-pulse">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="p-5 text-sm text-[var(--app-text-muted)]">No changes recorded yet.</div>
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {history.map((entry) => {
                  const personaId = entry.details?.personaId ?? entry.targetId ?? "unknown";
                  const personaName = PERSONA_META[personaId]?.name ?? personaId;
                  const isReset = entry.action === "ai_permissions.reset";

                  return (
                    <div key={entry.id} className="px-5 py-3 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--app-text)]">
                            {entry.actorEmail}
                          </span>
                          <span className="text-xs text-[var(--app-text-muted)]">
                            ({entry.actorRole})
                          </span>
                        </div>
                        <span className="text-xs text-[var(--app-text-muted)]">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {isReset ? (
                        <div className="text-xs text-[var(--app-text-muted)]">
                          Reset all persona configs to defaults
                          {entry.details?.deletedPersonas && (
                            <span> ({entry.details.deletedPersonas.join(", ")})</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span
                            className="text-xs font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              background: `${PERSONA_META[personaId]?.accent ?? "#888"}20`,
                              color: PERSONA_META[personaId]?.accent ?? "#888",
                            }}
                          >
                            {personaName}
                          </span>
                          {entry.details?.isNew && (
                            <span className="text-xs text-green-500 font-medium">New config</span>
                          )}
                          {entry.details?.changes && Object.entries(entry.details.changes).map(([field, change]) => (
                            <span key={field} className="text-xs text-[var(--app-text-muted)]">
                              <span className="font-medium text-[var(--app-text)]">{field}</span>
                              {": "}
                              {field === "enabledTools" ? (
                                <>
                                  {Array.isArray(change.old) ? change.old.length : 0} tools
                                  {" → "}
                                  {Array.isArray(change.new) ? change.new.length : 0} tools
                                </>
                              ) : (
                                <>
                                  <span className="line-through opacity-60">{String(change.old ?? "none")}</span>
                                  {" → "}
                                  <span>{String(change.new ?? "none")}</span>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {history.length > 0 && (
              <div className="px-5 py-2 bg-[var(--app-bg-secondary)] border-t border-[var(--app-border)]">
                <button
                  onClick={loadHistory}
                  className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition"
                >
                  Refresh
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold shadow-lg z-50 animate-pulse">
          {toast}
        </div>
      )}
    </div>
  );
}
