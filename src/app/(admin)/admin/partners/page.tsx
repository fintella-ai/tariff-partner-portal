"use client";

import { useState, useEffect, useCallback } from "react";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fmtDate, fmtPhone, normalizePhone } from "@/lib/format";
import LevelTag from "@/components/ui/LevelTag";
import DownlineTree, { type TreePartner } from "@/components/ui/DownlineTree";

type Partner = {
  id: string;
  partnerCode: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  mobilePhone: string | null;
  status: string;
  tier: string;
  commissionRate?: number; // Prisma returns it, consumed by tree view
  referredByPartnerCode: string | null;
  notes: string | null;
  signupDate: string;
  agreementStatus: string;
  w9Status: string;
  onboardingCompleted: number;
  onboardingTotal: number;
  onboardingPercent: number;
  onboardingStalled: boolean;
  onboardingDaysSinceSignup: number;
  engagementScore: number;
  engagementTier: string;
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

type TabType = "all" | "active" | "pending" | "invited" | "blocked" | "unsigned";

// Normalize a stored mobile number to E.164 for the softphone Device.
// Uses normalizePhone from @/lib/format (imported above).
// Wrapper kept to preserve null semantics for the softphone (must be valid E.164 or null).
function OnboardingProgressCell({ partner }: { partner: Partner }) {
  const done = partner.onboardingCompleted === partner.onboardingTotal;
  const stalled = partner.onboardingStalled;
  const barColor = done ? "bg-green-500" : stalled ? "bg-yellow-500" : "bg-brand-gold";
  const labelColor = done ? "text-green-400" : stalled ? "text-yellow-400" : "text-[var(--app-text-secondary)]";
  return (
    <div
      className="w-full flex items-center gap-1.5 min-w-0"
      title={stalled
        ? `${partner.onboardingCompleted}/${partner.onboardingTotal} · stalled ${partner.onboardingDaysSinceSignup}d since signup`
        : `${partner.onboardingCompleted}/${partner.onboardingTotal} steps complete`}
    >
      <div className="flex-1 h-1 rounded-full bg-[var(--app-input-bg)] overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${partner.onboardingPercent}%` }} />
      </div>
      <span className={`font-body text-[10px] font-semibold tabular-nums ${labelColor} shrink-0`}>
        {partner.onboardingPercent}%
      </span>
    </div>
  );
}

function normalizeForSoftphone(raw: string | null | undefined): string | null {
  return normalizePhone(raw);
}

const docBadge: Record<string, string> = {
  signed: "bg-green-500/10 text-green-400 border border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  viewed: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
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
  const { data: session } = useSession();
  const canSetPayoutDownline = ["super_admin", "admin", "partner_support"].includes(
    (session?.user as any)?.role || ""
  );
  // Bulk actions (status change, delete) are super-admin only — they
  // touch many rows at once and mistakes are expensive. The checkbox
  // column hides for everyone else so the UI doesn't imply a capability
  // they don't have.
  const canBulkAct = ((session?.user as any)?.role || "") === "super_admin";
  const router = useRouter();
  // Bulk-action checkboxes are hidden until the super admin opts in via
  // the "Show Bulk Actions" toggle above the table. Defined early so the
  // column-width hook below can key off it.
  const [showBulk, setShowBulk] = useState(false);
  const bulkOn = canBulkAct && showBulk;
  // 11 columns when bulk-select is on: [select] + Partner, Level, Referred By,
  // Code, Phone, Email, Status, Agreement, W9, Joined, Score, Tier.
  // 10 columns without: Partner, Level, Referred By, Code, Phone, Email,
  //                      Status, Agreement, W9, Joined, Score, Tier.
  // Storage key flips with `bulkOn` so the width map for 10-col vs 9-col
  // modes stays distinct and the layout never lands on a mismatched
  // array length after toggling.
  const { columnWidths: partnerCols, getResizeHandler: partnerResize } = useResizableColumns(
    bulkOn
      ? [36, 180, 70, 130, 120, 140, 180, 90, 110, 80, 120, 110, 60, 80]
      : [180, 70, 130, 120, 140, 180, 90, 110, 80, 120, 110, 60, 80],
    { storageKey: bulkOn ? "partners-v8-bulk" : "partners-v8" }
  );
  const partnerGridCols = partnerCols.map((w) => `${w}px`).join(" ");

  const [partners, setPartners] = useState<Partner[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  // Bulk-selection state — partner row IDs currently checked. Stays
  // local (not URL-synced) because the selection doesn't survive a
  // reload anyway (the status/delete verbs are terminal).
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkAgreementRate, setBulkAgreementRate] = useState("0.20");
  const [tablePage, setTablePage] = useState(1);
  const TABLE_PAGE_SIZE = 50;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "l1" | "l2" | "l3" | "l4plus">("all");
  // View toggle: classic list/table vs. an org-chart tree forest rooted
  // at a single partner the admin picks from `treeRootCode`. Tree view
  // renders nothing until a specific root is chosen — "All partners"
  // intentionally shows no forest (would be noise across dozens of L1s).
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");
  const [treeRootCode, setTreeRootCode] = useState<string>("");
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
  // Default-on per policy change 2026-04-23: Fintella pays every
  // downline partner directly (everyone signs a Fintella agreement),
  // so the "Enable Payout Downline Partners" checkbox starts checked.
  // Admins can still uncheck it for the rare legacy case where an L1
  // is responsible for paying their own downline.
  const [addPayoutDownlineEnabled, setAddPayoutDownlineEnabled] = useState(true);
  const [formError, setFormError] = useState("");

  // Invite L1 partner modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviteRate, setInviteRate] = useState<number | "">(0.25);
  const [inviteRateMode, setInviteRateMode] = useState<"standard" | "custom">("standard");
  const [inviteCustomPct, setInviteCustomPct] = useState<string>("");
  const [invitePayoutDownlineEnabled, setInvitePayoutDownlineEnabled] = useState(true);
  const [inviteError, setInviteError] = useState("");
  const [inviteResult, setInviteResult] = useState<{ signupUrl: string } | null>(null);
  const [inviteSending, setInviteSending] = useState(false);

  // Engagement tier filter
  const [engagementTierFilter, setEngagementTierFilter] = useState<"" | "hot" | "active" | "cooling" | "cold">("");

  // Sort state
  type SortCol = "name" | "code" | "status" | "joined" | "score";
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
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

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

  // Bulk helpers — toggle one row, toggle all visible rows, clear.
  // `visibleIds` is injected where called so select-all respects the
  // current tab + level-filter + search-filter view.
  const togglePartnerSelected = (id: string) => {
    setSelectedPartnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = (visibleIds: string[]) => {
    setSelectedPartnerIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedPartnerIds(new Set());

  const bulkUpdateStatus = async (status: string) => {
    if (selectedPartnerIds.size === 0) return;
    if (!confirm(`Mark ${selectedPartnerIds.size} partner(s) as "${status}"?`)) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/partners/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerIds: Array.from(selectedPartnerIds), status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Bulk update failed");
        return;
      }
      clearSelection();
      await fetchPartners();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedPartnerIds.size === 0) return;
    if (!confirm(`PERMANENTLY DELETE ${selectedPartnerIds.size} partner(s)? This writes to the real DB and cascades to their deals, commissions, and agreements. Cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/admin/partners/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerIds: Array.from(selectedPartnerIds) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Bulk delete failed");
        return;
      }
      clearSelection();
      await fetchPartners();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkSendAgreement = async () => {
    if (selectedPartnerIds.size === 0) return;
    const rate = parseFloat(bulkAgreementRate);
    const selected = partners.filter((p) => selectedPartnerIds.has(p.id));
    const noAgreement = selected.filter((p) => !p.agreementStatus || p.agreementStatus === "not_sent" || p.agreementStatus === "none");
    const hasAgreement = selected.filter((p) => p.agreementStatus && p.agreementStatus !== "not_sent" && p.agreementStatus !== "none");

    let msg = `Send ${Math.round(rate * 100)}% agreement to ${selectedPartnerIds.size} partner(s)?`;
    if (noAgreement.length > 0) msg += `\n\n${noAgreement.length} will receive a new agreement.`;
    if (hasAgreement.length > 0) msg += `\n\n${hasAgreement.length} have an existing agreement — it will be voided and replaced.`;

    if (!confirm(msg)) return;
    setBulkBusy(true);
    let sent = 0;
    let failed = 0;
    for (const p of selected) {
      try {
        const res = await fetch(`/api/admin/agreement/${p.partnerCode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rate }),
        });
        if (res.ok) sent++;
        else failed++;
      } catch { failed++; }
    }
    clearSelection();
    await fetchPartners();
    setBulkBusy(false);
    alert(`Agreements sent: ${sent}${failed > 0 ? `, failed: ${failed}` : ""}`);
  };

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
          ? "Enter a custom rate between 1% and 30%."
          : "Commission rate is required."
      );
      return;
    }
    setInviteSending(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), firstName: inviteFirst.trim(), lastName: inviteLast.trim(), commissionRate: rate, payoutDownlineEnabled: invitePayoutDownlineEnabled }),
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
    setInvitePayoutDownlineEnabled(true);
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
          payoutDownlineEnabled: addPayoutDownlineEnabled,
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
      setAddPayoutDownlineEnabled(true);
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

  // Rows waiting on admin review — either an L1-uploaded agreement or a W9
  // — float to the top of the list regardless of the selected sort column.
  // Lets admins see the approval queue without scanning.
  const needsReview = (p: Partner) => p.agreementStatus === "under_review" || p.w9Status === "under_review";

  // Depth helper mirroring the one used by the L4+ chip — lets the
  // filteredPartners list use the same level-matching logic as the
  // chip counts. Shared map keyed by partnerCode for O(depth) lookup.
  const partnersByCode: Record<string, Partner> = {};
  for (const p of partners) partnersByCode[p.partnerCode] = p;
  const partnerDepth = (p: Partner): number => {
    let d = 0;
    let cur: Partner | undefined = p;
    for (let i = 0; i < 10 && cur?.referredByPartnerCode; i++) {
      const parent: Partner | undefined = partnersByCode[cur.referredByPartnerCode];
      if (!parent) break;
      cur = parent;
      d++;
    }
    return d;
  };

  const filteredPartners = (activeTab === "all" || activeTab === "invited"
    ? partners
    : activeTab === "unsigned"
    ? partners.filter((p) => !p.agreementStatus || p.agreementStatus === "none" || p.agreementStatus === "not_sent")
    : partners.filter((p) => p.status === activeTab)
  ).filter((p) => {
    if (levelFilter === "all") return true;
    if (levelFilter === "l4plus") return partnerDepth(p) >= 3;
    return (p.tier || "l1") === levelFilter;
  })
   .filter((p) => {
    if (!engagementTierFilter) return true;
    return (p.engagementTier || "cold") === engagementTierFilter;
  })
   .slice().sort((a, b) => {
    // Priority bump: any row needing review jumps to the top.
    const aReview = needsReview(a) ? 0 : 1;
    const bReview = needsReview(b) ? 0 : 1;
    if (aReview !== bReview) return aReview - bReview;

    if (sortCol === "score") {
      const sa = a.engagementScore ?? 0;
      const sb = b.engagementScore ?? 0;
      return sortDir === "asc" ? sa - sb : sb - sa;
    }
    let va: string, vb: string;
    if (sortCol === "name") { va = `${a.firstName} ${a.lastName}`.toLowerCase(); vb = `${b.firstName} ${b.lastName}`.toLowerCase(); }
    else if (sortCol === "code") { va = a.partnerCode; vb = b.partnerCode; }
    else if (sortCol === "status") { va = a.status; vb = b.status; }
    else { va = a.signupDate; vb = b.signupDate; }
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const totalPages = Math.ceil(filteredPartners.length / TABLE_PAGE_SIZE);
  const paginatedPartners = filteredPartners.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);

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

  const unsignedCount = partners.filter((p) => !p.agreementStatus || p.agreementStatus === "none" || p.agreementStatus === "not_sent").length;

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "pending", label: "Pending" },
    { key: "unsigned", label: "Unsigned", count: unsignedCount },
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
                      max={30}
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
              {canSetPayoutDownline && (
                <div className="mt-3 flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="invitePayoutDownline"
                    checked={invitePayoutDownlineEnabled}
                    onChange={(e) => setInvitePayoutDownlineEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-[var(--app-border)] bg-[var(--app-input-bg)] accent-brand-gold cursor-pointer"
                  />
                  <label htmlFor="invitePayoutDownline" className="font-body text-[12px] text-[var(--app-text-secondary)] cursor-pointer">
                    <span className="font-semibold">Enable Payout Downline Partners</span>
                    <span className="block text-[11px] text-[var(--app-text-muted)] mt-0.5">
                      If enabled, Fintella sends SignWell agreements directly to this L1&apos;s L2 and L3 downline at signup and pays them commissions directly. If disabled (default), this L1 is paid the full commission rate for all downline deals and is responsible for paying their downline themselves.
                    </span>
                  </label>
                </div>
              )}
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

      {/* Add Partner Form.
          Admins normally add L1 partners (top-of-chain, no upline). L2
          and L3 partners come into existence via a parent's invite
          link. The Tier + Referred By fields are preserved here as an
          override for corrections (e.g. re-creating an L2 whose record
          was lost) — default path leaves tier=L1 and referrer empty. */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="font-body font-semibold text-sm mb-1">Add New Partner</div>
          <p className="font-body text-[11px] text-[var(--app-text-muted)] mb-4">
            Default is a new <strong>L1</strong> with no upline. Use Tier L2/L3 + Referred By only as an override for corrections — normal onboarding is an invite from the parent partner.
          </p>
          {formError && <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg font-body text-[12px] text-red-400">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input className={inputClass} value={formFirst} onChange={(e) => setFormFirst(e.target.value)} placeholder="First Name *" />
            <input className={inputClass} value={formLast} onChange={(e) => setFormLast(e.target.value)} placeholder="Last Name *" />
            <input className={inputClass} value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="Email *" type="email" />
            <input className={inputClass} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone" />
            <input className={inputClass} value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="Partner Code (auto-generated)" />
            <input className={inputClass} value={formReferrer} onChange={(e) => setFormReferrer(e.target.value)} placeholder="Referred By (override — partner code)" />
            <select className={inputClass} value={formTier} onChange={(e) => {
              const newTier = e.target.value as "l1" | "l2" | "l3";
              setFormTier(newTier);
              if (newTier !== "l1") setAddPayoutDownlineEnabled(false);
            }}>
              <option value="l1">Tier: L1 (default)</option>
              <option value="l2">Tier: L2 (override)</option>
              <option value="l3">Tier: L3 (override)</option>
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
                  max={30}
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
          {canSetPayoutDownline && formTier === "l1" && (
            <div className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                id="addPayoutDownline"
                checked={addPayoutDownlineEnabled}
                onChange={(e) => setAddPayoutDownlineEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[var(--app-border)] bg-[var(--app-input-bg)] accent-brand-gold cursor-pointer"
              />
              <label htmlFor="addPayoutDownline" className="font-body text-[12px] text-[var(--app-text-secondary)] cursor-pointer">
                <span className="font-semibold">Enable Payout Downline Partners</span>
                <span className="block text-[11px] text-[var(--app-text-muted)] mt-0.5">
                  If enabled, Fintella sends SignWell agreements directly to this L1&apos;s L2 and L3 downline at signup and pays them commissions directly. If disabled (default), this L1 is paid the full commission rate for all downline deals and is responsible for paying their downline themselves.
                </span>
              </label>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} className="btn-gold text-[12px] px-5 py-2.5">Create Partner</button>
            <button onClick={() => { setShowForm(false); setAddPayoutDownlineEnabled(true); }} className="font-body text-[12px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-5 py-2.5 hover:text-[var(--app-text-secondary)] transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedInviteIds([]); setBulkResult(null); setTablePage(1); }}
            className={`shrink-0 px-4 rounded-lg font-body text-[12px] font-medium transition-colors min-h-[44px] ${
              activeTab === tab.key
                ? "bg-brand-gold text-black"
                : "border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {tab.label}{tab.count != null && tab.count > 0 && <span className="ml-1 text-[10px] text-red-400">({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Level filter chips — only meaningful for partner rows, not invites */}
      {activeTab !== "invited" && (() => {
        const byStatus = activeTab === "all"
          ? partners
          : partners.filter((p) => p.status === activeTab);

        // Depth-from-root for the L4+ bucket. Walk each partner up the
        // referredByPartnerCode chain via a code→partner map. A chain of
        // N hops = depth N. Cap at 10 to guard against accidental cycles.
        const byCode: Record<string, Partner> = {};
        for (const p of byStatus) byCode[p.partnerCode] = p;
        const depthOf = (p: Partner): number => {
          let d = 0;
          let cur: Partner | undefined = p;
          for (let i = 0; i < 10 && cur?.referredByPartnerCode; i++) {
            const parent: Partner | undefined = byCode[cur.referredByPartnerCode];
            if (!parent) break;
            cur = parent;
            d++;
          }
          return d;
        };
        const matchesLevel = (p: Partner, k: "l1" | "l2" | "l3" | "l4plus"): boolean => {
          if (k === "l4plus") return depthOf(p) >= 3;
          return (p.tier || "l1") === k;
        };
        const countByLevel = (k: "l1" | "l2" | "l3" | "l4plus") =>
          byStatus.filter((p) => matchesLevel(p, k)).length;
        const chips: { key: "all" | "l1" | "l2" | "l3" | "l4plus"; label: string; count: number }[] = [
          { key: "all", label: "All levels", count: byStatus.length },
          { key: "l1", label: "L1", count: countByLevel("l1") },
          { key: "l2", label: "L2", count: countByLevel("l2") },
          { key: "l3", label: "L3", count: countByLevel("l3") },
          { key: "l4plus", label: "L4+", count: countByLevel("l4plus") },
        ];
        // Tier-matched accent colors for the L1/L2/L3 chips — gold / silver /
        // bronze, same palette as LevelTag. The "All levels" chip stays neutral.
        const chipStyles: Record<string, { on: string; off: string }> = {
          all: {
            on: "bg-brand-gold/20 text-brand-gold border border-brand-gold/40",
            off: "border border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]",
          },
          l1: {
            on: "bg-[rgba(196,160,80,0.22)] text-[#d4b060] border border-[rgba(196,160,80,0.55)]",
            off: "border border-[rgba(196,160,80,0.3)] text-[#c4a050] hover:bg-[rgba(196,160,80,0.1)]",
          },
          l2: {
            on: "bg-[rgba(200,205,215,0.2)] text-[#d7dbe3] border border-[rgba(200,205,215,0.45)]",
            off: "border border-[rgba(200,205,215,0.25)] text-[#bcc1cb] hover:bg-[rgba(200,205,215,0.08)]",
          },
          l3: {
            on: "bg-[rgba(184,115,51,0.22)] text-[#d99a6c] border border-[rgba(184,115,51,0.55)]",
            off: "border border-[rgba(184,115,51,0.3)] text-[#c9895c] hover:bg-[rgba(184,115,51,0.1)]",
          },
          // L4+ uses a neutral slate tone so it reads as "depth overflow"
          // rather than a new tier color — these are still L3 or deeper
          // partners by stored tier, just past the three-ladder.
          l4plus: {
            on: "bg-[rgba(100,116,139,0.22)] text-[#94a3b8] border border-[rgba(100,116,139,0.55)]",
            off: "border border-[rgba(100,116,139,0.3)] text-[#64748b] hover:bg-[rgba(100,116,139,0.1)]",
          },
        };
        return (
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
            {chips.map((c) => {
              const s = chipStyles[c.key] || chipStyles.all;
              return (
                <button
                  key={c.key}
                  onClick={() => setLevelFilter(c.key)}
                  className={`shrink-0 px-3 rounded-full font-body text-[11px] font-medium transition-colors min-h-[32px] flex items-center gap-1.5 ${
                    levelFilter === c.key ? s.on : s.off
                  }`}
                >
                  <span>{c.label}</span>
                  <span className="font-mono text-[10px] opacity-70">{c.count}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* View toggle — list (classic table) vs tree (org-chart forest rooted
          at each L1). Tree view ignores the level filter + bulk actions
          but still respects the active tab + search. */}
      {activeTab !== "invited" && (
        <div className="mb-4 flex items-center gap-2">
          <span className="font-body text-[11px] text-[var(--app-text-muted)]">View:</span>
          <div className="inline-flex rounded-lg border border-[var(--app-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`font-body text-[11px] px-3 py-1.5 transition-colors ${
                viewMode === "list"
                  ? "bg-brand-gold/20 text-brand-gold"
                  : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`font-body text-[11px] px-3 py-1.5 transition-colors border-l border-[var(--app-border)] ${
                viewMode === "tree"
                  ? "bg-brand-gold/20 text-brand-gold"
                  : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
              }`}
            >
              Tree
            </button>
          </div>
        </div>
      )}

      {/* Search + Engagement Tier Filter */}
      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <input
          className={`${inputClass} flex-1`}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setTablePage(1); }}
          placeholder={activeTab === "invited" ? "Search by name or email..." : "Search by name, email, or partner code..."}
        />
        {activeTab !== "invited" && (
          <select
            value={engagementTierFilter}
            onChange={(e) => setEngagementTierFilter(e.target.value as "" | "hot" | "active" | "cooling" | "cold")}
            className="text-sm rounded-lg px-3 py-1.5 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] text-[var(--app-text)] font-body outline-none focus:border-brand-gold/40 transition-colors min-h-[44px] sm:min-h-0 sm:w-44"
          >
            <option value="">All Tiers</option>
            <option value="hot">🔥 Hot</option>
            <option value="active">Active</option>
            <option value="cooling">Cooling</option>
            <option value="cold">Cold</option>
          </select>
        )}
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
            <div className="grid grid-cols-[auto_2fr_0.6fr_0.7fr_auto_0.9fr_0.9fr_auto] gap-3 px-5 py-3 border-b border-[var(--app-border)] items-center">
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
              {["Invitee", "Rate", "Status", "Link", "Sent", "Expires", ""].map((h) => (
                <div key={h} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">{h}</div>
              ))}
            </div>

            {/* Rows */}
            {filteredInvites.map((inv) => {
              const isResendable = inv.status !== "used";
              const isResending = resendingId === inv.id;
              const feedback = resendFeedback[inv.id];
              const inviteUrl = `${window.location.origin}/getstarted?token=${inv.token}`;
              const isCopied = copiedInviteId === inv.id;
              return (
                <div
                  key={inv.id}
                  className="grid grid-cols-[auto_2fr_0.6fr_0.7fr_auto_0.9fr_0.9fr_auto] gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center"
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
                  <div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteUrl);
                        setCopiedInviteId(inv.id);
                        setTimeout(() => setCopiedInviteId((prev) => prev === inv.id ? null : prev), 2000);
                      }}
                      className={`font-body text-[11px] px-2.5 min-h-[28px] rounded-lg border transition-colors whitespace-nowrap ${
                        isCopied
                          ? "text-green-400 border-green-500/20 bg-green-500/10"
                          : "text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                      }`}
                      title={inviteUrl}
                    >
                      {isCopied ? "Copied ✓" : "Copy Link"}
                    </button>
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
              const inviteUrl = `${window.location.origin}/getstarted?token=${inv.token}`;
              const isCopied = copiedInviteId === inv.id;
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
                  {/* Mobile: copy link */}
                  <div className="mb-3">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inviteUrl);
                        setCopiedInviteId(inv.id);
                        setTimeout(() => setCopiedInviteId((prev) => prev === inv.id ? null : prev), 2000);
                      }}
                      className={`w-full font-body text-[11px] px-3 min-h-[36px] rounded-lg border transition-colors ${
                        isCopied
                          ? "text-green-400 border-green-500/20 bg-green-500/10"
                          : "text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
                      }`}
                    >
                      {isCopied ? "Link Copied ✓" : "Copy Invite Link"}
                    </button>
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
          {/* Bulk action bar — renders only for super admins with at
              least one partner row checked. Floats above the table
              with sticky-like prominence. Status dropdown + Delete +
              Clear; Clear resets the selection without committing. */}

          {/* Show/Hide Bulk Actions toggle — super-admin-only. Checkboxes
              on both the desktop table and mobile cards stay hidden
              until this is flipped on. Clears any pending selection when
              hiding so we never keep "5 selected" state invisible. */}
          {canBulkAct && viewMode === "list" && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const next = !showBulk;
                  setShowBulk(next);
                  if (!next) setSelectedPartnerIds(new Set());
                }}
                className="font-body text-[12px] text-brand-gold/80 hover:text-brand-gold border border-brand-gold/25 hover:bg-brand-gold/10 rounded-lg px-3 py-1.5 transition-colors"
              >
                {showBulk ? "Hide Bulk Actions" : "Show Bulk Actions"}
              </button>
            </div>
          )}

          {canBulkAct && selectedPartnerIds.size > 0 && (
            <div className="card mb-4 p-3 sm:p-4 flex flex-wrap items-center gap-3 border-brand-gold/30 bg-brand-gold/[0.04]">
              <span className="font-body text-[12px] text-[var(--app-text-secondary)]">
                <strong>{selectedPartnerIds.size}</strong> selected
              </span>
              <span className="text-[var(--app-text-faint)]">·</span>
              <label className="font-body text-[11px] text-[var(--app-text-muted)]">Mark as:</label>
              <select
                disabled={bulkBusy}
                onChange={(e) => {
                  const v = e.target.value;
                  e.target.value = "";
                  if (v) void bulkUpdateStatus(v);
                }}
                className="theme-input text-[12px] px-2 py-1.5 rounded-lg"
                defaultValue=""
              >
                <option value="" disabled>Choose status…</option>
                <option value="active">active</option>
                <option value="pending">pending</option>
                <option value="invited">invited</option>
                <option value="blocked">blocked</option>
                <option value="inactive">inactive</option>
              </select>
              <span className="text-[var(--app-text-faint)]">·</span>
              <label className="font-body text-[11px] text-[var(--app-text-muted)]">Agreement:</label>
              <select
                value={bulkAgreementRate}
                onChange={(e) => setBulkAgreementRate(e.target.value)}
                disabled={bulkBusy}
                className="theme-input text-[12px] px-2 py-1.5 rounded-lg"
              >
                <option value="0.25">25%</option>
                <option value="0.20">20%</option>
                <option value="0.15">15%</option>
                <option value="0.10">10%</option>
              </select>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkSendAgreement()}
                className="font-body text-[12px] text-brand-gold/80 border border-brand-gold/30 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors disabled:opacity-50"
              >
                Send Agreement
              </button>
              <span className="text-[var(--app-text-faint)]">·</span>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void bulkDelete()}
                className="font-body text-[12px] text-red-400/80 border border-red-500/30 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                Delete selected
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={clearSelection}
                className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}

          {/* Tree view — org-chart rooted at a single partner the admin
              picks via the dropdown below. "All partners" intentionally
              renders no tree because a forest of every L1 is just noise
              once you have more than a handful. Pick a specific root
              (any partner, not just L1) and the tree walks their downline
              at arbitrary depth. Option B has no hard cap on chain depth. */}
          {viewMode === "tree" && (() => {
            const toNode = (p: Partner): TreePartner => {
              const children = partners
                .filter((c) => c.referredByPartnerCode === p.partnerCode)
                .sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""))
                .map(toNode);
              return {
                id: p.id,
                partnerCode: p.partnerCode,
                firstName: p.firstName || "",
                lastName: p.lastName || "",
                status: p.status,
                commissionRate: p.commissionRate,
                children,
              };
            };

            // Alphabetical partner list feeding the dropdown — all partners,
            // not just L1, so admins can drill into mid-chain trees too.
            const dropdownPartners = [...partners].sort((a, b) => {
              const an = `${a.lastName || ""} ${a.firstName || ""}`.trim();
              const bn = `${b.lastName || ""} ${b.firstName || ""}`.trim();
              return an.localeCompare(bn);
            });
            const selectedRootPartner = treeRootCode
              ? partners.find((p) => p.partnerCode === treeRootCode)
              : null;

            return (
              <div className="space-y-4">
                <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="font-body text-[12px] text-[var(--app-text-secondary)] font-semibold shrink-0">
                    Tree root partner:
                  </label>
                  <select
                    value={treeRootCode}
                    onChange={(e) => setTreeRootCode(e.target.value)}
                    className="theme-input text-[13px] px-3 py-2 rounded-lg flex-1 min-w-0"
                  >
                    <option value="">— All partners (tree hidden) —</option>
                    {dropdownPartners.map((p) => (
                      <option key={p.id} value={p.partnerCode}>
                        {(p.lastName || "").trim()}{p.lastName ? ", " : ""}{p.firstName} ({p.partnerCode}) · {(p.tier || "l1").toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {treeRootCode && (
                    <button
                      type="button"
                      onClick={() => setTreeRootCode("")}
                      className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {selectedRootPartner ? (
                  <div className="card p-4 sm:p-5 overflow-x-auto">
                    <DownlineTree root={toNode(selectedRootPartner)} />
                  </div>
                ) : (
                  <div className="card p-12 text-center font-body text-[13px] text-[var(--app-text-muted)]">
                    Pick a partner above to see their downline tree.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Partners — Desktop Table + Mobile Cards (list view) */}
          {viewMode === "list" && (<>
          <div className="card hidden sm:block overflow-x-auto">
            <div className="grid gap-3 px-5 py-3 border-b border-[var(--app-border)]" style={{ gridTemplateColumns: partnerGridCols }}>
              {(bulkOn ? ([
                { label: "__select", col: null },
                { label: "Partner", col: "name" as SortCol },
                { label: "Level", col: null },
                { label: "Referred By", col: null },
                { label: "Code", col: "code" as SortCol },
                { label: "Phone", col: null },
                { label: "Email", col: null },
                { label: "Status", col: "status" as SortCol },
                { label: "Agreement", col: null },
                { label: "W9", col: null },
                { label: "Onboarding", col: null },
                { label: "Joined", col: "joined" as SortCol },
                { label: "Score", col: "score" as SortCol },
                { label: "Tier", col: null },
              ]) : ([
                { label: "Partner", col: "name" as SortCol },
                { label: "Level", col: null },
                { label: "Referred By", col: null },
                { label: "Code", col: "code" as SortCol },
                { label: "Phone", col: null },
                { label: "Email", col: null },
                { label: "Status", col: "status" as SortCol },
                { label: "Agreement", col: null },
                { label: "W9", col: null },
                { label: "Onboarding", col: null },
                { label: "Joined", col: "joined" as SortCol },
                { label: "Score", col: "score" as SortCol },
                { label: "Tier", col: null },
              ])).map((h, i) => (
                h.label === "__select" ? (
                  <div key="__select" className="flex items-center justify-center relative">
                    <input
                      type="checkbox"
                      checked={filteredPartners.length > 0 && filteredPartners.every((p) => selectedPartnerIds.has(p.id))}
                      onChange={() => toggleAllVisible(paginatedPartners.map((p) => p.id))}
                      className="w-4 h-4 rounded cursor-pointer accent-[#c4a050]"
                      title="Select all visible"
                    />
                    <span {...partnerResize(i)} />
                  </div>
                ) :
                h.col ? (
                  <button
                    key={h.label}
                    onClick={() => handleSort(h.col!)}
                    className={`relative w-full font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider flex items-center gap-0.5 hover:text-[var(--app-text-secondary)] transition-colors ${h.label === "Partner" ? "justify-start" : "justify-center"}`}
                  >
                    {h.label}<SortIcon col={h.col} /><span {...partnerResize(i)} />
                  </button>
                ) : (
                  <div key={h.label || `col-${i}`} className="relative w-full font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider text-center">{h.label}<span {...partnerResize(i)} /></div>
                )
              ))}
            </div>
            {paginatedPartners.map((p) => {
              const e164 = normalizeForSoftphone(p.mobilePhone || p.phone);
              return (
                <div
                  key={p.id}
                  className="grid gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors items-center cursor-pointer"
                  style={{ gridTemplateColumns: partnerGridCols }}
                  onClick={() => router.push(`/admin/partners/${p.id}`)}
                >
                  {bulkOn && (
                    <div
                      className="flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPartnerIds.has(p.id)}
                        onChange={() => togglePartnerSelected(p.id)}
                        className="w-4 h-4 rounded cursor-pointer accent-[#c4a050]"
                      />
                    </div>
                  )}
                  <div className="font-body text-[13px] text-[var(--app-text)] font-medium truncate text-left">{p.firstName} {p.lastName}</div>
                  <div className="text-center">
                    <LevelTag tier={p.tier} />
                  </div>
                  <div className="font-body text-[12px] text-center truncate">
                    {(() => {
                      if (!p.referredByPartnerCode) return <span className="text-[var(--app-text-muted)]">—</span>;
                      const upline = partnersByCode[p.referredByPartnerCode];
                      if (!upline) return <span className="text-[var(--app-text-muted)]">{p.referredByPartnerCode}</span>;
                      return (
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/admin/partners/${upline.id}`); }}
                          className="text-brand-gold hover:underline truncate"
                          title={`${upline.firstName} ${upline.lastName} (${upline.partnerCode})`}
                        >
                          {upline.firstName} {upline.lastName}
                        </button>
                      );
                    })()}
                  </div>
                  <div className="font-mono text-[12px] text-[var(--app-text-secondary)] text-center">{p.partnerCode}</div>
                  <div className="font-mono text-[12px] truncate text-center">
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
                  <div className="font-body text-[12px] text-[var(--app-text-secondary)] truncate text-center">{p.email}</div>
                  <div className="text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[p.status] || statusBadge.active}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${docBadge[p.agreementStatus] || docBadge.none}`}>
                      {p.agreementStatus === "under_review" ? "review" : p.agreementStatus}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${docBadge[p.w9Status] || docBadge.needed}`}>
                      {p.w9Status === "under_review" ? "review" : p.w9Status}
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <OnboardingProgressCell partner={p} />
                  </div>
                  <div className="font-body text-[12px] text-[var(--app-text-muted)] text-center">{fmtDate(p.signupDate)}</div>
                  <div className="font-body text-[12px] tabular-nums text-center text-[var(--app-text-secondary)]">{p.engagementScore ?? 0}</div>
                  <div className="text-center">
                    {(() => {
                      const et = p.engagementTier || "cold";
                      const etBadge: Record<string, string> = {
                        hot: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                        active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                        cooling: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                        cold: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
                      };
                      const etLabel: Record<string, string> = { hot: "🔥 Hot", active: "Active", cooling: "Cooling", cold: "Cold" };
                      return (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${etBadge[et] || etBadge.cold}`}>
                          {etLabel[et] || "Cold"}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            {filteredPartners.length === 0 && (
              <div className="px-5 py-10 text-center font-body text-[13px] text-[var(--app-text-muted)]">No partners found.</div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--app-border)]">
              <span className="font-body text-[11px] text-[var(--app-text-muted)]">
                Showing {(tablePage - 1) * TABLE_PAGE_SIZE + 1}–{Math.min(tablePage * TABLE_PAGE_SIZE, filteredPartners.length)} of {filteredPartners.length}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                  className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-[var(--app-border)] disabled:opacity-30 hover:bg-[var(--app-input-bg)] transition"
                >
                  ← Prev
                </button>
                <span className="font-body text-[11px] px-3 py-1.5 text-[var(--app-text-muted)]">
                  {tablePage} / {totalPages}
                </span>
                <button
                  onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                  disabled={tablePage === totalPages}
                  className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-[var(--app-border)] disabled:opacity-30 hover:bg-[var(--app-input-bg)] transition"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Partners — Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {paginatedPartners.map((p) => (
              <div key={p.id} className="card p-4 cursor-pointer hover:bg-[var(--app-card-bg)] transition-colors" onClick={() => router.push(`/admin/partners/${p.id}`)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  {bulkOn && (
                    <div
                      className="shrink-0 pt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPartnerIds.has(p.id)}
                        onChange={() => togglePartnerSelected(p.id)}
                        className="w-4 h-4 rounded cursor-pointer accent-[#c4a050]"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{p.firstName} {p.lastName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <LevelTag tier={p.tier} size="xs" />
                      <span className="font-mono text-[11px] text-[var(--app-text-muted)]">{p.partnerCode}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[p.status] || statusBadge.active}`}>
                    {p.status}
                  </span>
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">{p.email}</div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-body text-[11px] text-[var(--app-text-muted)]">Joined {fmtDate(p.signupDate)}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-body text-[9px] text-[var(--app-text-muted)] uppercase">Agmt:</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${docBadge[p.agreementStatus] || docBadge.none}`}>
                        {p.agreementStatus === "under_review" ? "review" : p.agreementStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-body text-[9px] text-[var(--app-text-muted)] uppercase">W9:</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${docBadge[p.w9Status] || docBadge.needed}`}>
                        {p.w9Status === "under_review" ? "review" : p.w9Status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-body text-[9px] text-[var(--app-text-muted)] uppercase">Onb:</span>
                      <OnboardingProgressCell partner={p} />
                    </div>
                  </div>
                </div>
                {/* Engagement tier badge — mobile */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--app-border)]">
                  <span className="font-body text-[9px] text-[var(--app-text-muted)] uppercase">Engagement:</span>
                  {(() => {
                    const et = p.engagementTier || "cold";
                    const etBadge: Record<string, string> = {
                      hot: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                      active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                      cooling: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                      cold: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
                    };
                    const etLabel: Record<string, string> = { hot: "🔥 Hot", active: "Active", cooling: "Cooling", cold: "Cold" };
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${etBadge[et] || etBadge.cold}`}>
                        {etLabel[et] || "Cold"}
                      </span>
                    );
                  })()}
                  <span className="font-body text-[10px] text-[var(--app-text-muted)] tabular-nums ml-1">Score: {p.engagementScore ?? 0}</span>
                </div>
              </div>
            ))}
            {filteredPartners.length === 0 && (
              <div className="text-center py-10 font-body text-[13px] text-[var(--app-text-muted)]">No partners found.</div>
            )}
          </div>
          </>)}
        </>
      )}
    </div>
  );
}
