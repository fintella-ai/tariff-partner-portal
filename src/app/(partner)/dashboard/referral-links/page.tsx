"use client";

import { useState, useEffect, useCallback } from "react";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT, SUPPORT_EMAIL } from "@/lib/constants";
import { markGettingStartedLinkShared } from "@/lib/markGettingStarted";

interface Invite {
  id: string;
  token: string;
  targetTier: string;
  commissionRate: number;
  status: string;
  usedByPartnerCode: string | null;
  usedByName: string | null;
  usedByEmail: string | null;
  createdAt: string;
}

export default function ReferralLinksPage() {
  const { columnWidths: inviteCols, getResizeHandler: inviteResize } = useResizableColumns([80, 80, 100, 130, 150, 100], { storageKey: "referral-links" });
  const { data: session } = useSession();
  const device = useDevice();
  const router = useRouter();
  const partnerCode = (session?.user as any)?.partnerCode || "DEMO";

  const [invites, setInvites] = useState<Invite[]>([]);
  const [partnerTier, setPartnerTier] = useState("l1");
  const [partnerRate, setPartnerRate] = useState(0.25);
  const [allowedDownlineRates, setAllowedDownlineRates] = useState<number[]>([]);
  const [l3Enabled, setL3Enabled] = useState(false);
  const [copiedRate, setCopiedRate] = useState<number | null>(null);
  const [agreementSigned, setAgreementSigned] = useState<boolean | null>(null);

  // Invite send form
  const [sendFirstName, setSendFirstName] = useState("");
  const [sendLastName, setSendLastName] = useState("");
  const [sendEmail, setSendEmail] = useState("");
  const [sendPhone, setSendPhone] = useState("");
  const [sendMethod, setSendMethod] = useState<"email" | "sms" | "both">("email");
  const [sendRate, setSendRate] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Which section is visible. Tabs are the consolidated layout for
  // recruiters; L3 (and any partner without downline rates) bypasses
  // them entirely and falls through to the "no recruitment" message.
  type ReferralTab = "send" | "links" | "tracking";
  const [activeTab, setActiveTab] = useState<ReferralTab>("send");

  // Check agreement status — gate requires BOTH a signed agreement AND an
  // active Partner row. Post-#76 the SignWell webhook keeps these in sync
  // automatically; checking both here is defense-in-depth.
  useEffect(() => {
    fetch("/api/agreement")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const agreementOk =
          data.agreement?.status === "signed" ||
          data.agreement?.status === "approved";
        const partnerOk = data.partnerStatus === "active";
        setAgreementSigned(agreementOk && partnerOk);
      })
      .catch(() => setAgreementSigned(true));
  }, []);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://fintella.partners";

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
        setPartnerTier(data.partner?.tier || "l1");
        setPartnerRate(data.partner?.commissionRate || 0.25);
        setAllowedDownlineRates(data.partner?.allowedDownlineRates || []);
        setL3Enabled(data.l3Enabled || false);
      }
    } catch {}
  }, []);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  // Delete a single unused invite. Used + expired invites cannot be deleted
  // (server returns 409 — preserve audit trail). After delete we refresh the
  // list. Note: auto-generated invites will re-create on next "Recruit L2"
  // tab open via ensureInvitesExist; this handler is for removing extras
  // or cleaning up unused demo-era links.
  const deleteInvite = useCallback(
    async (invId: string) => {
      if (!confirm("Delete this unused invite link? This cannot be undone.")) return;
      const res = await fetch(`/api/invites/${invId}`, { method: "DELETE" });
      if (res.ok) {
        await loadInvites();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete invite");
      }
    },
    [loadInvites]
  );

  // Lazy-create a single invite for a specific rate. Used when the partner
  // first clicks Copy / Send on a rate that has no invite yet. Replaces the
  // old ensureInvitesExist auto-gen so the Tracking tab isn't pre-populated
  // with unused links (a brand new partner's Tracking tab should start empty).
  const createInviteForRate = useCallback(
    async (rate: number): Promise<Invite | undefined> => {
      const existing = invites.find(
        (i) =>
          Math.round(i.commissionRate * 100) === Math.round(rate * 100) &&
          i.status === "active"
      );
      if (existing) return existing;
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate }),
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      await loadInvites();
      return (data.invite as Invite) ?? undefined;
    },
    [invites, loadInvites]
  );

  // Determine which rates this partner can offer (comes from API, dynamic based on their own rate)
  const canRecruit = (partnerTier === "l1" || (partnerTier === "l2" && l3Enabled)) && allowedDownlineRates.length > 0;
  const availableRates = allowedDownlineRates;
  const targetTierLabel = partnerTier === "l1" ? "L2" : "L3";

  // Auto-create invite links for all available rates when switching to links tab
  useEffect(() => {
    if (activeTab !== "links" || !canRecruit || availableRates.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const rate of availableRates) {
        if (cancelled) return;
        const existing = invites.find(
          (i) => Math.round(i.commissionRate * 100) === Math.round(rate * 100) && i.status === "active"
        );
        if (!existing) await createInviteForRate(rate);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canRecruit, availableRates.length]);

  // Get invite link for a specific rate
  function getInviteForRate(rate: number): Invite | undefined {
    return invites.find((i) => Math.round(i.commissionRate * 100) === Math.round(rate * 100) && i.status === "active");
  }

  async function copyRateLink(rate: number) {
    let inv = getInviteForRate(rate);
    if (!inv) {
      inv = await createInviteForRate(rate);
      if (!inv) {
        alert("Couldn't create invite link — please try again.");
        return;
      }
    }
    navigator.clipboard.writeText(`${baseUrl}/signup?token=${inv.token}`);
    setCopiedRate(rate);
    setTimeout(() => setCopiedRate(null), 2000);
    markGettingStartedLinkShared();
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!sendRate || !sendEmail.trim() || !sendFirstName.trim() || !sendLastName.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/invites/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: sendFirstName.trim(),
          lastName: sendLastName.trim(),
          email: sendEmail.trim(),
          phone: sendPhone.trim() || undefined,
          rate: sendRate,
          method: sendMethod,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to send invite");
        return;
      }
      await loadInvites();
      setSendSuccess(true);
      setTimeout(() => {
        setSendSuccess(false);
        setSendFirstName(""); setSendLastName(""); setSendEmail(""); setSendPhone("");
        setSendRate(null);
      }, 3000);
    } catch {
      alert("Failed to send invite — please try again.");
    } finally {
      setSending(false);
    }
  }

  // Split invites by status for tracking tabs
  const activeInvites = invites.filter((i) => i.status === "active");
  const usedInvites = invites.filter((i) => i.status === "used");
  const [trackingTab, setTrackingTab] = useState<"active" | "used">("active");
  const allInvites = invites;

  if (agreementSigned === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm theme-text-muted">Checking agreement status...</div>
      </div>
    );
  }

  if (!agreementSigned) {
    return (
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Referral Links</h2>
        <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">Share client links and recruit partners to your downline.</p>
        <div className={`card ${device.cardPadding} ${device.borderRadius} border border-yellow-500/25`}>
          <div className="text-center py-6">
            <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h3 className="font-display text-lg sm:text-xl font-bold mb-2">Partnership Agreement Required</h3>
            <p className="font-body text-sm text-[var(--app-text-secondary)] mb-6 max-w-md mx-auto leading-relaxed">
              You must sign your partnership agreement before accessing referral links or recruiting partners.
            </p>
            <button onClick={() => router.push("/dashboard/documents")} className="btn-gold w-full max-w-xs mx-auto">Go to Documents &rarr;</button>
          </div>
        </div>
      </div>
    );
  }

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-3 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Referral Links</h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">Share client links and recruit partners to your downline.</p>

      {/* ═══ TAB BAR ═══
          Consolidates the three recruitment surfaces (Send invite /
          Copy link / Track) behind a single navigation row so the page
          doesn't read as an endless scroll. Only shown to partners who
          can recruit — L3 falls through to the informational card. */}
      {canRecruit && (
        <div className="mb-6 border-b border-[var(--app-border)] flex flex-wrap gap-1">
          {([
            { id: "send", label: "Send Partner Invite" },
            { id: "links", label: `Recruit ${targetTierLabel} Partner Links` },
            { id: "tracking", label: "Invite Tracking" },
          ] as const).map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`font-body text-[13px] px-4 py-2.5 rounded-t-lg border border-b-0 transition-colors min-h-[40px] ${
                  active
                    ? "text-brand-gold border-[var(--app-border)] bg-[var(--app-card-bg)] -mb-px"
                    : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)] hover:bg-brand-gold/5"
                }`}
              >
                {t.label}
                {t.id === "tracking" && usedInvites.length > 0 && (
                  <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-brand-gold/15 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)]"}`}>
                    {usedInvites.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ PARTNER RECRUITMENT — PRE-LOADED RATE LINKS ═══ */}
      {canRecruit && activeTab === "links" && (
        <div className="card mb-6">
          <div className={`${device.cardPadding} border-b`} style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">👥</span>
              <div className="font-body font-semibold text-[15px]">Recruit {targetTierLabel} Partners</div>
            </div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)] leading-relaxed">
              Copy a recruitment link below. Each rate has its own pre-loaded template. You earn the override — the difference between your {Math.round(partnerRate * 100)}% and their rate.
            </div>
          </div>

          <div className={`${device.cardPadding}`}>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">
              {targetTierLabel} Partner Recruitment Links
            </div>
            <div className="space-y-4">
              {availableRates.map((rate) => {
                const pct = Math.round(rate * 100);
                const overridePct = Math.round((partnerRate - rate) * 100);
                const inv = getInviteForRate(rate);
                const link = inv ? `${baseUrl}/signup?token=${inv.token}` : "Creating link...";

                return (
                  <div key={rate} className="p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="font-display text-xl font-bold text-brand-gold">{pct}%</div>
                        <div>
                          <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{targetTierLabel} Partner Rate</div>
                          <div className="font-body text-[10px] text-green-400">You earn {overridePct}% override</div>
                        </div>
                      </div>
                      <button
                        onClick={() => copyRateLink(rate)}
                        disabled={!inv}
                        className={`font-body text-[12px] px-4 py-2 rounded-lg border transition-colors min-h-[40px] ${
                          copiedRate === rate
                            ? "bg-green-500/15 border-green-500/30 text-green-400"
                            : "border-brand-gold/20 text-brand-gold hover:bg-brand-gold/10"
                        } disabled:opacity-50`}
                      >
                        {copiedRate === rate ? "✓ Copied!" : "Copy Link"}
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--app-text-muted)] truncate select-all p-2 rounded bg-[var(--app-input-bg)] border border-[var(--app-border)]">
                      {link}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SEND PARTNER INVITE ═══ */}
      {canRecruit && activeTab === "send" && (
        <div className="card mb-6">
          <div className={`${device.cardPadding} border-b`} style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📤</span>
              <div className="font-body font-semibold text-[15px]">Send Partner Invite</div>
            </div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)] leading-relaxed">
              Send a referral partner invite directly via email or SMS.
            </div>
          </div>
          <form onSubmit={handleSendInvite} className={`${device.cardPadding}`}>
            <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-4`}>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">First Name *</label>
                <input className={inputClass} value={sendFirstName} onChange={(e) => setSendFirstName(e.target.value)} placeholder="First name" required />
              </div>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">Last Name *</label>
                <input className={inputClass} value={sendLastName} onChange={(e) => setSendLastName(e.target.value)} placeholder="Last name" required />
              </div>
            </div>
            <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-4`}>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">Email *</label>
                <input type="email" className={inputClass} value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="partner@example.com" required />
              </div>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">Mobile Phone (SMS)</label>
                <input type="tel" className={inputClass} value={sendPhone} onChange={(e) => setSendPhone(e.target.value)} placeholder="+1 (555) 123-4567" />
              </div>
            </div>
            <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-4 mb-4`}>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">Commission Rate *</label>
                <select className={inputClass} value={sendRate || ""} onChange={(e) => setSendRate(e.target.value ? parseFloat(e.target.value) : null)} required>
                  <option value="">Select rate...</option>
                  {availableRates.map((r) => (
                    <option key={r} value={r}>{Math.round(r * 100)}% — {targetTierLabel} Partner</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">Send Via *</label>
                <select className={inputClass} value={sendMethod} onChange={(e) => setSendMethod(e.target.value as any)}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="both">Both Email & SMS</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={sending || !sendRate || !sendEmail.trim() || !sendFirstName.trim() || !sendLastName.trim()}
              className="btn-gold text-sm px-6 py-2.5 disabled:opacity-50"
            >
              {sending ? "Sending..." : sendSuccess ? "✓ Invite Sent!" : "Send Referral Partner Invite"}
            </button>
            {sendSuccess && (
              <div className="mt-3 font-body text-[12px] text-green-400">Invite sent successfully! It will appear in the tracking table below.</div>
            )}
          </form>
        </div>
      )}

      {/* ═══ INVITE TRACKING ═══ */}
      {canRecruit && activeTab === "tracking" && (
        <div className="card mb-6">
          <div className={`${device.cardPadding} border-b`} style={{ borderColor: "var(--app-border)" }}>
            <div className="font-body font-semibold text-[15px]">Invite Tracking</div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)]">Track the status of your partner recruitment invites.</div>
          </div>

          {/* Active / Used sub-tabs */}
          <div className="flex border-b border-[var(--app-border)]">
            {([
              { id: "active" as const, label: "Active", count: activeInvites.length },
              { id: "used" as const, label: "Completed", count: usedInvites.length },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTrackingTab(t.id)}
                className={`font-body text-[12px] px-4 py-2.5 transition-colors ${
                  trackingTab === t.id
                    ? "text-brand-gold border-b-2 border-brand-gold -mb-px"
                    : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    trackingTab === t.id ? "bg-brand-gold/15 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)]"
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Active invites — waiting to be used */}
          {trackingTab === "active" && activeInvites.length > 0 && (
            <div className="divide-y divide-[var(--app-border)]">
              {activeInvites.map((inv) => (
                <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-base font-bold text-brand-gold">{Math.round(inv.commissionRate * 100)}%</span>
                    <div>
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{inv.targetTier.toUpperCase()} Partner</div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                        Created {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${baseUrl}/signup?token=${inv.token}`);
                        setCopiedRate(inv.commissionRate);
                        setTimeout(() => setCopiedRate(null), 2000);
                        markGettingStartedLinkShared();
                      }}
                      className={`font-body text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                        copiedRate === inv.commissionRate
                          ? "bg-green-500/15 border-green-500/30 text-green-400"
                          : "border-brand-gold/20 text-brand-gold/70 hover:bg-brand-gold/10"
                      }`}
                    >
                      {copiedRate === inv.commissionRate ? "Copied!" : "Copy Link"}
                    </button>
                    <button
                      onClick={() => deleteInvite(inv.id)}
                      className="font-body text-[11px] px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400/70 hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {trackingTab === "active" && activeInvites.length === 0 && (
            <div className="p-6 text-center font-body text-[13px] text-[var(--app-text-muted)]">
              No active invites. Generate links from the <button onClick={() => setActiveTab("links")} className="text-brand-gold hover:underline">Recruit {targetTierLabel} Partner Links</button> tab.
            </div>
          )}

          {/* Used/Completed invites — partner signed up */}
          {trackingTab === "used" && usedInvites.length > 0 && (
            <div className="divide-y divide-[var(--app-border)]">
              {usedInvites.map((inv) => (
                <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-base font-bold text-brand-gold">{Math.round(inv.commissionRate * 100)}%</span>
                    <div>
                      <div className="font-body text-[13px] text-[var(--app-text)]">
                        {inv.usedByName || inv.usedByPartnerCode || "Unknown"}
                      </div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                        {inv.usedByEmail && <span>{inv.usedByEmail} · </span>}
                        {inv.targetTier.toUpperCase()} Partner · Joined {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Completed
                  </span>
                </div>
              ))}
            </div>
          )}

          {trackingTab === "used" && usedInvites.length === 0 && (
            <div className="p-6 text-center font-body text-[13px] text-[var(--app-text-muted)]">
              No partners have signed up yet. Share your invite links to start recruiting.
            </div>
          )}
        </div>
      )}

      {/* L3 partners can't recruit */}
      {partnerTier === "l3" && (
        <div className="card p-5 mb-6 text-center">
          <div className="font-body text-[13px] text-[var(--app-text-muted)]">Partner recruitment is not available for L3 partners.</div>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="card px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">
          Your partner code: <span className="text-brand-gold font-semibold tracking-wider">{partnerCode}</span>
          <span className="ml-2 text-[var(--app-text-faint)]">&middot; {partnerTier.toUpperCase()} at {Math.round(partnerRate * 100)}%</span>
        </div>
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">
          {FIRM_SHORT} Support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[var(--app-text-secondary)] hover:text-brand-gold">{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
