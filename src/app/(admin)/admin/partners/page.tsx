"use client";

import { useState, useEffect, useCallback } from "react";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import { useRouter } from "next/navigation";
import { fmtDate, fmtPhone, normalizePhone } from "@/lib/format";

type Partner = {
  id: string;
  partnerCode: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  mobilePhone: string | null;
  status: string;
  referredByPartnerCode: string | null;
  notes: string | null;
  signupDate: string;
  agreementStatus: string;
  w9Status: string;
};

type Invite = {
  id: string;
  token: string;
  invitedEmail: string | null;
  invitedName: string | null;
  commissionRate: number;
  status: string;
  targetTier: string;
  expiresAt: string;
  createdAt: string;
};

type TabType = "all" | "active" | "pending" | "invited" | "blocked";

// Normalize a stored mobile number to E.164 for the softphone Device.
// Uses normalizePhone from @/lib/format (imported above).
// Wrapper kept to preserve null semantics for the softphone (must be valid E.164 or null).
function normalizeForSoftphone(raw: string | null | undefined): string | null {
  return normalizePhone(raw);
}

const docBadge: Record<string, string> = {
  signed: "bg-green-500/10 text-green-400 border border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  amended: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  not_sent: "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]",
  none: "bg-red-500/10 text-red-400 border border-red-500/20",
  approved: "bg-green-500/10 text-green-400 border border-green-500/20",
  uploaded: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  under_review: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  needed: "bg-red-500/10 text-red-400 border border-red-500/20",
};

const statusBadge: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  inactive: "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] border border-[var(--app-border)]",
  blocked: "bg-red-500/10 text-red-400 border border-red-500/20",
  invited: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
};

const inviteStatusBadge: Record<string, string> = {
  active: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  used: "bg-green-500/10 text-green-400 border border-green-500/20",
  expired: "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]",
};

export default function AdminPartnersPage() {
  const router = useRouter();
  // 8 columns: Partner, Code, Phone, Email, Status, W9, Joined, Action
  const { columnWidths: partnerCols, getResizeHandler: partnerResize } = useResizableColumns(
    [180, 120, 140, 180, 90, 80, 110, 70],
    { storageKey: "partners" }
  );
  const partnerGridCols = partnerCols.map((w) => `${w}px`).join(" ");

  const [partners, setPartners] = useState<Partner[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [showForm, setShowForm] = useState(false);

  // Add partner form
  const [formFirst, setFormFirst] = useState("");
  const [formLast, setFormLast] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formReferrer, setFormReferrer] = useState("");
  const [formTier, setFormTier] = useState<"l1" | "l2" | "l3">("l1");
  const [formRate, setFormRate] = useState<number>(0.25);
  const [formRateMode, setFormRateMode] = useState<"standard" | "custom">("standard");
  const [formCustomPct, setFormCustomPct] = useState<string>("");
  const [formError, setFormError] = useState("");

  // Invite L1 partner modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviteRate, setInviteRate] = useState<number | "">(0.25);
  const [inviteRateMode, setInviteRateMode] = useState<"standard" | "custom">("standard");
  const [inviteCustomPct, setInviteCustomPct] = useState<string>("");
  const [inviteError, setInviteError] = useState("");
  const [inviteResult, setInviteResult] = useState<{ signupUrl: string } | null>(null);
  const [inviteSending, setInviteSending] = useState(false);

  // Sort state
  type SortCol = "name" | "code" | "status" | "joined";
  const [sortCol, setSortCol] = useState<SortCol>("joined");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <span className="ml-1 opacity-30 text-[10px]">↕</span>;
    return <span className="ml-1 text-brand-gold text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  // Resend invite state
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [bulkResending, setBulkResending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ succeeded: number; failed: number } | null>(null);
  const [resendFeedback, setResendFeedback] = useState<Record<string, "ok" | "error">>({});

  const ALLOWED_L1_RATES = [0.10, 0.15, 0.20, 0.25];

  const fetchPartners = useCallback(async () => {
    try {
      const url = search ? `/api/admin/partners?search=${encodeURIComponent(search)}` : "/api/admin/partners";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPartners(data.partners || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [search]);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);
  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const resolvedInviteRate = (): number | null => {
    if (inviteRateMode === "custom") {
      const pct = parseFloat(inviteCustomPct);
      if (!isFinite(pct) || pct <= 0 || pct > 50) return null;
      return Math.round(pct * 100) / 10000; // pct=28 → 0.28, 2-decimal % precision
    }
    return typeof inviteRate === "number" ? inviteRate : null;
  };

  const handleInvite = async () => {
    setInviteError("");
    if (!inviteEmail.trim()) { setInviteError("Email is required."); return; }
    const rate = resolvedInviteRate();
    if (rate == null) {
      setInviteError(
        inviteRateMode === "custom"
          ? "Enter a custom rate between 1% and 50%."
          : "Commission rate is required."
      );
      return;
    }
    setInviteSending(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), firstName: inviteFirst.trim(), lastName: inviteLast.trim(), commissionRate: rate }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error || "Failed to send invite"); return; }
      setInviteResult({ signupUrl: data.signupUrl });
      fetchInvites();
    } catch {
      setInviteError("Connection error");
    } finally {
      setInviteSending(false);
    }
  };

  const resetInvite = () => {
    setShowInvite(false);
    setInviteEmail(""); setInviteFirst(""); setInviteLast(""); setInviteRate(0.25);
    setInviteRateMode("standard"); setInviteCustomPct("");
    setInviteError(""); setInviteResult(null);
  };

  // ── Resend helpers ────────────────────────────────────────────────────────

  const toggleSelectInvite = (id: string) => {
    setSelectedInviteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleResendInvite = async (inviteId: string) => {
    setResendingId(inviteId);
    try {
      const res = await fetch(`/api/admin/invites/${inviteId}/resend`, { method: "POST" });
      setResendFeedback((prev) => ({ ...prev, [inviteId]: res.ok ? "ok" : "error" }));
    } catch {
      setResendFeedback((prev) => ({ ...prev, [inviteId]: "error" }));
    } finally {
      setResendingId(null);
      setTimeout(() => {
        setResendFeedback((prev) => { const n = { ...prev }; delete n[inviteId]; return n; });
        fetchInvites();
      }, 1800);
    }
  };

  const handleBulkResend = async () => {
    setBulkResending(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/admin/invites/bulk-resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedInviteIds }),
      });
      const data = await res.json();
      setBulkResult({ succeeded: data.succeeded ?? 0, failed: data.failed ?? selectedInviteIds.length });
      setSelectedInviteIds([]);
    } catch {
      setBulkResult({ succeeded: 0, failed: selectedInviteIds.length });
      setSelectedInviteIds([]);
    } finally {
      setBulkResending(false);
      setTimeout(() => { setBulkResult(null); fetchInvites(); }, 3000);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const resolvedFormRate = (): number | null => {
    if (formRateMode === "custom") {
      const pct = parseFloat(formCustomPct);
      if (!isFinite(pct) || pct <= 0 || pct > 50) return null;
      return Math.round(pct * 100) / 10000;
    }
    return formRate;
  };

  const handleAdd = async () => {
    setFormError("");
    if (!formFirst.trim() || !formLast.trim() || !formEmail.trim()) {
      setFormError("First name, last name, and email are required.");
      return;
    }
    const rate = resolvedFormRate();
    if (rate == null) {
      setFormError("Custom rate must be between 1% and 50%.");
      return;
    }
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formFirst.trim(),
          lastName: formLast.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || null,
          partnerCode: formCode.trim() || undefined,
          referredByPartnerCode: formReferrer.trim() || null,
          tier: formTier,
          commissionRate: rate,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || "Failed to create partner");
        return;
      }
      setShowForm(false);
      setFormFirst(""); setFormLast(""); setFormEmail(""); setFormPhone(""); setFormCode(""); setFormReferrer("");
      setFormTier("l1"); setFormRate(0.25); setFormRateMode("standard"); setFormCustomPct("");
      fetchPartners();
    } catch {
      setFormError("Connection error");
    }
  };

  const total = partners.length;
  const active = partners.filter((p) => p.status === "active").length;
  const pending = partners.filter((p) => p.status === "pending").length;
  const blocked = partners.filter((p) => p.status === "blocked").length;
  const invitedCount = invites.filter((inv) => inv.status === "active").length;

  const filteredPartners = (activeTab === "all" || activeTab === "invited"
    ? partners
    : partners.filter((p) => p.status === activeTab)
  ).slice().sort((a, b) => {
    let va: string, vb: string;
    if (sortCol === "name") { va = `${a.firstName} ${a.lastName}`.toLowerCase(); vb = `${b.firstName} ${b.lastName}`.toLowerCase(); }
    else if (sortCol === "code") { va = a.partnerCode; vb = b.partnerCode; }
    else if (sortCol === "status") { va = a.status; vb = b.status; }
    else { va = a.signupDate; vb = b.signupDate; }
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const filteredInvites = invites.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invitedEmail?.toLowerCase().includes(q) ||
      inv.invitedName?.toLowerCase().includes(q)
    );
  });

  // Only non-used invites can be selected for resend
  const resendableInvites = filteredInvites.filter((inv) => inv.status !== "used");
  const allSelected =
    resendableInvites.length > 0 &&
    resendableInvites.every((inv) => selectedInviteIds.includes(inv.id));

  const tabs: { key: TabType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "pending", label: "Pending" },
    { key: "invited", label: "Invited" },
    { key: "blocked", label: "Blocked" },
  ];

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-2.5 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-xl font-bold">Partner Management</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)] mt-1">View, add, and manage partners.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button onClick={() => { setShowInvite(true); setShowForm(false); }} className="btn-gold text-[12px] px-4 min-h-[44px]">
            + Invite Partner
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowInvite(false); }} className="font-body text-[12px] px-4 min-h-[44px] border border-[var(--app-border)] rounded-lg theme-text-secondary hover:theme-text transition-colors">
            + Add Directly
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Partners", value: total, color: "text-[var(--app-text)]" },
          { label: "Active", value: active, color: "text-green-400" },
          { label: "Pending", value: pending, color: "text-yellow-400" },
          { label: "Invited", value: invitedCount, color: "text-blue-400" },
          { label: "Blocked", value: blocked, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Invite L1 Partner Modal */}
      {showInvite && (
        <div className="card p-5 mb-6">
          <div className="font-body font-semibold text-sm mb-1">Invite L1 Partner</div>
          <div className="font-body text-[12px] theme-text-muted mb-4">An invitation email with a signup link will be sent. The link expires in 7 days.</div>
          {!inviteResult ? (
            <>
              {inviteError && <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg font-body text-[12px] text-red-400">{inviteError}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <input className={inputClass} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email *" type="email" />
                {inviteRateMode === "standard" ? (
                  <select
                    className={inputClass}
                    value={inviteRate}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setInviteRateMode("custom");
                        setInviteRate("");
                      } else {
                        setInviteRate(e.target.value ? parseFloat(e.target.value) : "");
                      }
                    }}
                  >
                    <option value="">Select commission rate *</option>
                    {ALLOWED_L1_RATES.map((r) => (
                      <option key={r} value={r}>{Math.round(r * 100)}% — L1 Partner</option>
                    ))}
                    <option value="__custom__">Custom rate…</option>
                  </select>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      className={`${inputClass} flex-1`}
                      type="number"
                      min={1}
                      max={50}
                      step={0.5}
                      value={inviteCustomPct}
                      onChange={(e) => setInviteCustomPct(e.target.value)}
                      placeholder="Custom % (e.g. 28)"
                    />
                    <button
                      type="button"
                      onClick={() => { setInviteRateMode("standard"); setInviteCustomPct(""); setInviteRate(0.25); }}
                      className="font-body text-[11px] theme-text-muted hover:text-brand-gold transition-colors"
                    >
                      Back to standard
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={inputClass} value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} placeholder="First Name (optional)" />
                <input className={inputClass} value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} placeholder="Last Name (optional)" />
              </div>
              {(() => {
                const r = resolvedInviteRate();
                if (r == null) return null;
                // Downline ceiling is the firm's 25% cap. For standard L1 rates
                // the practical max is L1 - 5% (leaves room for L1's override);
                // for custom L1 rates above 25% we clamp at 25% so downline
                // partners still can't exceed the firm-wide cap.
                const downlineMax = r > 0.25 ? 0.25 : r - 0.05;
                const fmt = (n: number) => {
                  const pct = n * 100;
                  return pct % 1 === 0 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
                };
                return (
                  <div className="mt-3 p-3 rounded-lg bg-brand-gold/5 border border-brand-gold/20 font-body text-[12px] theme-text-muted">
                    At <strong className="text-brand-gold">{fmt(r)}</strong>, this partner can offer their recruits rates from <strong>5%</strong> up to <strong>{fmt(downlineMax)}</strong>.
                    {inviteRateMode === "custom" && (
                      <div className="mt-1.5 text-[11px] theme-text-faint">
                        Custom rate — uses the 25% agreement template with rate interpolation via the SignWell <code>commission_rate_percent</code> / <code>commission_rate_text</code> api_ids.
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="flex gap-3 mt-4">
                <button onClick={handleInvite} disabled={inviteSending} className="btn-gold text-[12px] px-5 min-h-[44px] disabled:opacity-50">{inviteSending ? "Sending..." : "Send Invite"}</button>
                <button onClick={resetInvite} className="font-body text-[12px] theme-text-muted border border-[var(--app-border)] rounded-lg px-5 min-h-[44px] hover:theme-text-secondary transition-colors">Cancel</button>
              </div>
            </>
          ) : (
            <div>
              <div className="mb-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg font-body text-[12px] text-green-400">
                Invite sent to <strong>{inviteEmail}</strong>. They will receive an email with their signup link.
              </div>
              <div className="mb-3 p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider mb-1.5">Signup Link (share manually if needed)</div>
                <div className="font-mono text-[11px] theme-text-secondary break-all">{inviteResult.signupUrl}</div>
              </div>
              <button onClick={resetInvite} className="btn-gold text-[12px] px-5 min-h-[44px]">Done</button>
            </div>
          )}
        </div>
      )}

      {/* Add Partner Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="font-body font-semibold text-sm mb-4">Add New Partner</div>
          {formError && <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg font-body text-[12px] text-red-400">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input className={inputClass} value={formFirst} onChange={(e) => setFormFirst(e.target.value)} placeholder="First Name *" />
            <input className={inputClass} value={formLast} onChange={(e) => setFormLast(e.target.value)} placeholder="Last Name *" />
            <input className={inputClass} value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="Email *" type="email" />
            <input className={inputClass} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone" />
            <input className={inputClass} value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="Partner Code (auto-generated)" />
            <input className={inputClass} value={formReferrer} onChange={(e) => setFormReferrer(e.target.value)} placeholder="Referred By (partner code)" />
            <select className={inputClass} value={formTier} onChange={(e) => setFormTier(e.target.value as "l1" | "l2" | "l3")}>
              <option value="l1">Tier: L1</option>
              <option value="l2">Tier: L2</option>
              <option value="l3">Tier: L3</option>
            </select>
            {formRateMode === "standard" ? (
              <select
                className={inputClass}
                value={formRate}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setFormRateMode("custom");
                  } else {
                    setFormRate(parseFloat(e.target.value));
                  }
                }}
              >
                {ALLOWED_L1_RATES.map((r) => (
                  <option key={r} value={r}>{Math.round(r * 100)}% commission</option>
                ))}
                <option value="__custom__">Custom rate…</option>
              </select>
            ) : (
              <div className="flex gap-2 items-center">
                <input
                  className={`${inputClass} flex-1`}
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={formCustomPct}
                  onChange={(e) => setFormCustomPct(e.target.value)}
                  placeholder="Custom % (e.g. 28)"
                />
                <button
                  type="button"
                  onClick={() => { setFormRateMode("standard"); setFormCustomPct(""); setFormRate(0.25); }}
                  className="font-body text-[11px] theme-text-muted hover:text-brand-gold transition-colors"
                >
                  Standard
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} className="btn-gold text-[12px] px-5 py-2.5">Create Partner</button>
            <button onClick={() => setShowForm(false)} className="font-body text-[12px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-5 py-2.5 hover:text-[var(--app-text-secondary)] transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedInviteIds([]); setBulkResult(null); }}
            className={`shrink-0 px-4 rounded-lg font-body text-[12px] font-medium transition-colors min-h-[44px] ${
              activeTab === tab.key
                ? "bg-brand-gold text-black"
                : "border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className={inputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={activeTab === "invited" ? "Search by name or email..." : "Search by name, email, or partner code..."}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="font-body text-sm text-[var(--app-text-muted)]">Loading partners...</div>
        </div>
      ) : activeTab === "invited" ? (
        <>
          {/* Bulk action bar */}
          {(selectedInviteIds.length > 0 || bulkResult) && (
            <div className="mb-3 p-3 rounded-lg border border-[var(--app-border)] flex flex-wrap items-center gap-3" style={{ background: "var(--app-input-bg)" }}>
              {bulkResult ? (
                <span className={`font-body text-[13px] ${bulkResult.failed === 0 ? "text-green-400" : "text-yellow-400"}`}>
                  {bulkResult.succeeded > 0 && `${bulkResult.succeeded} invite${bulkResult.succeeded !== 1 ? "s" : ""} resent`}
                  {bulkResult.succeeded > 0 && bulkResult.failed > 0 && " · "}
                  {bulkResult.failed > 0 && `${bulkResult.failed} failed`}
                </span>
              ) : (
                <>
                  <span className="font-body text-[13px] theme-text-secondary">
                    {selectedInviteIds.length} selected
                  </span>
                  <button
                    onClick={handleBulkResend}
                    disabled={bulkResending}
                    className="btn-gold text-[12px] px-4 min-h-[44px] disabled:opacity-50"
                  >
                    {bulkResending ? "Sending..." : "Resend Selected"}
                  </button>
                  <button
                    onClick={() => setSelectedInviteIds([])}
                    className="font-body text-[12px] theme-text-muted border border-[var(--app-border)] rounded-lg px-4 min-h-[44px] hover:theme-text-secondary transition-colors"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}

          {/* Invited — Desktop Table */}
          <div className="card hidden sm:block overflow-x-auto">
            {/* Header */}
            <div className="grid grid-cols-[auto_2fr_0.6fr_0.7fr_0.9fr_0.9fr_auto] gap-3 px-5 py-3 border-b border-[var(--app-border)] items-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) {
                    setSelectedInviteIds([]);
                  } else {
                    setSelectedInviteIds(resendableInvites.map((inv) => inv.id));
                  }
                }}
                disabled={resendableInvites.length === 0}
                className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 accent-[#c4a050]"
                title={allSelected ? "Deselect all" : "Select all"}
              />
              {["Invitee", "Rate", "Status", "Sent", "Expires", ""].map((h) => (
                <div key={h} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">{h}</div>
              ))}
            </div>

            {/* Rows */}
            {filteredInvites.map((inv) => {
              const isResendable = inv.status !== "used";
              const isResending = resendingId === inv.id;
              const feedback = resendFeedback[inv.id];
              return (
                <div
                  key={inv.id}
                  className="grid grid-cols-[auto_2fr_0.6fr_0.7fr_0.9fr_0.9fr_auto] gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center"
                >
                  <input
                    type="checkbox"
                    checked={selectedInviteIds.includes(inv.id)}
                    onChange={() => isResendable && toggleSelectInvite(inv.id)}
                    disabled={!isResendable}
                    className="w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 accent-[#c4a050]"
                  />
                  <div>
                    <div className="font-body text-[13px] text-[var(--app-text)] font-medium">{inv.invitedName || "—"}</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">{inv.invitedEmail || "—"}</div>
                  </div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)]">{Math.round(inv.commissionRate * 100)}%</div>
                  <div>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${inviteStatusBadge[inv.status] || inviteStatusBadge.expired}`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(inv.createdAt)}</div>
                  <div className="font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(inv.expiresAt)}</div>
                  <div>
                    <button
                      onClick={() => handleResendInvite(inv.id)}
                      disabled={!isResendable || isResending || !!feedback}
                      className={`font-body text-[11px] px-3 min-h-[32px] rounded-lg border transition-colors whitespace-nowrap disabled:cursor-not-allowed ${
                        feedback === "ok"
                          ? "text-green-400 border-green-500/20 bg-green-500/10"
                          : feedback === "error"
                          ? "text-red-400 border-red-500/20 bg-red-500/10"
                          : isResendable
                          ? "text-brand-gold border-brand-gold/30 hover:bg-brand-gold/10 disabled:opacity-50"
                          : "text-[var(--app-text-muted)] border-[var(--app-border)] opacity-40"
                      }`}
                    >
                      {isResending
                        ? "Sending…"
                        : feedback === "ok"
                        ? "Sent ✓"
                        : feedback === "error"
                        ? "Failed"
                        : "Resend"}
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredInvites.length === 0 && (
              <div className="px-5 py-10 text-center font-body text-[13px] text-[var(--app-text-muted)]">No invites found.</div>
            )}
          </div>

          {/* Invited — Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {filteredInvites.map((inv) => {
              const isResendable = inv.status !== "used";
              const isResending = resendingId === inv.id;
              const feedback = resendFeedback[inv.id];
              return (
                <div key={inv.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{inv.invitedName || "—"}</div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">{inv.invitedEmail || "—"}</div>
                    </div>
                    <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${inviteStatusBadge[inv.status] || inviteStatusBadge.expired}`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">Rate: {Math.round(inv.commissionRate * 100)}%</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">Expires {fmtDate(inv.expiresAt)}</div>
                  </div>
                  {/* Mobile: select + resend row */}
                  <div className="flex items-center justify-between pt-3 border-t border-[var(--app-border)]">
                    <label className={`flex items-center gap-2 ${isResendable ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}>
                      <input
                        type="checkbox"
                        checked={selectedInviteIds.includes(inv.id)}
                        onChange={() => isResendable && toggleSelectInvite(inv.id)}
                        disabled={!isResendable}
                        className="w-4 h-4 rounded accent-[#c4a050]"
                      />
                      <span className="font-body text-[11px] theme-text-muted select-none">Select</span>
                    </label>
                    <button
                      onClick={() => handleResendInvite(inv.id)}
                      disabled={!isResendable || isResending || !!feedback}
                      className={`font-body text-[11px] px-3 min-h-[44px] rounded-lg border transition-colors whitespace-nowrap disabled:cursor-not-allowed ${
                        feedback === "ok"
                          ? "text-green-400 border-green-500/20 bg-green-500/10"
                          : feedback === "error"
                          ? "text-red-400 border-red-500/20 bg-red-500/10"
                          : isResendable
                          ? "text-brand-gold border-brand-gold/30 hover:bg-brand-gold/10 disabled:opacity-50"
                          : "text-[var(--app-text-muted)] border-[var(--app-border)] opacity-40"
                      }`}
                    >
                      {isResending
                        ? "Sending…"
                        : feedback === "ok"
                        ? "Sent ✓"
                        : feedback === "error"
                        ? "Failed"
                        : "Resend"}
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredInvites.length === 0 && (
              <div className="text-center py-10 font-body text-[13px] text-[var(--app-text-muted)]">No invites found.</div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Partners — Desktop Table */}
          <div className="card hidden sm:block overflow-x-auto">
            <div className="grid gap-3 px-5 py-3 border-b border-[var(--app-border)]" style={{ gridTemplateColumns: partnerGridCols }}>
              {([
                { label: "Partner", col: "name" as SortCol },
                { label: "Code", col: "code" as SortCol },
                { label: "Phone", col: null },
                { label: "Email", col: null },
                { label: "Status", col: "status" as SortCol },
                { label: "W9", col: null },
                { label: "Joined", col: "joined" as SortCol },
                { label: "", col: null },
              ] as { label: string; col: SortCol | null }[]).map((h, i) => (
                h.col ? (
                  <button
                    key={h.label}
                    onClick={() => handleSort(h.col!)}
                    className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider flex items-center gap-0.5 hover:text-[var(--app-text-secondary)] transition-colors justify-center"
                  >
                    {h.label}<SortIcon col={h.col} /><span {...partnerResize(i)} />
                  </button>
                ) : (
                  <div key={h.label || `col-${i}`} className="relative font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center">{h.label}<span {...partnerResize(i)} /></div>
                )
              ))}
            </div>
            {filteredPartners.map((p) => {
              const e164 = normalizeForSoftphone(p.mobilePhone || p.phone);
              return (
                <div
                  key={p.id}
                  className="grid gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors items-center cursor-pointer"
                  style={{ gridTemplateColumns: partnerGridCols }}
                  onClick={() => router.push(`/admin/partners/${p.id}`)}
                >
                  <div className="font-body text-[13px] text-[var(--app-text)] font-medium truncate">{p.firstName} {p.lastName}</div>
                  <div className="font-mono text-[12px] text-[var(--app-text-secondary)]">{p.partnerCode}</div>
                  <div className="font-mono text-[12px] truncate">
                    {e164 ? (
                      <button
                        onClick={(evt) => {
                          evt.stopPropagation();
                          const sp = (window as any).__fintellaSoftphone;
                          if (sp) sp.call(e164, `${p.firstName} ${p.lastName}`.trim(), p.partnerCode);
                        }}
                        className="text-brand-gold hover:underline"
                        title="Click to dial via softphone"
                      >
                        📞 {fmtPhone(p.mobilePhone || p.phone)}
                      </button>
                    ) : (
                      <span className="text-[var(--app-text-muted)]">—</span>
                    )}
                  </div>
                  <div className="font-body text-[12px] text-[var(--app-text-secondary)] truncate">{p.email}</div>
                  <div className="text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[p.status] || statusBadge.active}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${docBadge[p.w9Status] || docBadge.needed}`}>
                      {p.w9Status === "under_review" ? "review" : p.w9Status}
                    </span>
                  </div>
                  <div className="font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(p.signupDate)}</div>
                  <div className="text-right">
                    <span className="font-body text-[11px] text-brand-gold/60 hover:text-brand-gold transition-colors">View →</span>
                  </div>
                </div>
              );
            })}
            {filteredPartners.length === 0 && (
              <div className="px-5 py-10 text-center font-body text-[13px] text-[var(--app-text-muted)]">No partners found.</div>
            )}
          </div>

          {/* Partners — Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {filteredPartners.map((p) => (
              <div key={p.id} className="card p-4 cursor-pointer hover:bg-[var(--app-card-bg)] transition-colors" onClick={() => router.push(`/admin/partners/${p.id}`)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{p.firstName} {p.lastName}</div>
                    <div className="font-mono text-[11px] text-[var(--app-text-muted)] mt-0.5">{p.partnerCode}</div>
                  </div>
                  <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[p.status] || statusBadge.active}`}>
                    {p.status}
                  </span>
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">{p.email}</div>
                <div className="flex items-center justify-between">
                  <div className="font-body text-[11px] text-[var(--app-text-muted)]">Joined {fmtDate(p.signupDate)}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-body text-[9px] text-[var(--app-text-muted)] uppercase">W9:</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${docBadge[p.w9Status] || docBadge.needed}`}>
                      {p.w9Status === "under_review" ? "review" : p.w9Status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {filteredPartners.length === 0 && (
              <div className="text-center py-10 font-body text-[13px] text-[var(--app-text-muted)]">No partners found.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
