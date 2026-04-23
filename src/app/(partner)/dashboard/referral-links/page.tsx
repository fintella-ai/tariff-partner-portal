"use client";

import { useState, useEffect, useCallback } from "react";
import { useResizableColumns } from "@/components/ui/ResizableTable";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import CopyButton from "@/components/ui/CopyButton";
import { FIRM_SHORT, SUPPORT_EMAIL } from "@/lib/constants";

interface Invite {
  id: string;
  token: string;
  targetTier: string;
  commissionRate: number;
  status: string;
  usedByPartnerCode: string | null;
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
  const clientRefUrl = `https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content=${partnerCode}`;

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

  // Auto-generate one invite per rate if none exist for that rate
  const ensureInvitesExist = useCallback(async (rates: number[]) => {
    for (const rate of rates) {
      const existing = invites.find((i) => Math.round(i.commissionRate * 100) === Math.round(rate * 100) && i.status === "active");
      if (!existing) {
        await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rate }),
        });
      }
    }
    await loadInvites();
  }, [invites, loadInvites]);

  // Determine which rates this partner can offer (comes from API, dynamic based on their own rate)
  const canRecruit = (partnerTier === "l1" || (partnerTier === "l2" && l3Enabled)) && allowedDownlineRates.length > 0;
  const availableRates = allowedDownlineRates;
  const targetTierLabel = partnerTier === "l1" ? "L2" : "L3";

  // Auto-generate invites once we know the rates
  useEffect(() => {
    if (canRecruit && availableRates.length > 0 && invites.length >= 0) {
      const missing = availableRates.filter((rate) =>
        !invites.some((i) => Math.round(i.commissionRate * 100) === Math.round(rate * 100) && i.status === "active")
      );
      if (missing.length > 0) {
        ensureInvitesExist(availableRates);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRecruit, availableRates.length, invites.length]);

  // Get invite link for a specific rate
  function getInviteForRate(rate: number): Invite | undefined {
    return invites.find((i) => Math.round(i.commissionRate * 100) === Math.round(rate * 100) && i.status === "active");
  }

  function copyRateLink(rate: number) {
    const inv = getInviteForRate(rate);
    if (!inv) return;
    navigator.clipboard.writeText(`${baseUrl}/signup?token=${inv.token}`);
    setCopiedRate(rate);
    setTimeout(() => setCopiedRate(null), 2000);
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!sendRate || !sendEmail.trim()) return;
    setSending(true);
    try {
      const inv = getInviteForRate(sendRate);
      if (!inv) { alert("No invite link available for this rate"); return; }
      // For now, record the invite send (actual email/SMS sending will be Phase 15)
      // We'll store it as a notification for tracking
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: false }), // placeholder — actual send in Phase 15
      });
      setSendSuccess(true);
      setTimeout(() => {
        setSendSuccess(false);
        setSendFirstName(""); setSendLastName(""); setSendEmail(""); setSendPhone("");
        setSendRate(null);
      }, 3000);
    } catch {}
    finally { setSending(false); }
  }

  // All invites for tracking (including used ones)
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

      {/* ═══ CLIENT SUBMISSION LINK ═══ */}
      <div className={`card ${device.cardPadding} border border-[#c4a050]/30 mb-6`}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">📩</span>
          <div className="font-body font-semibold text-[15px]">Client Submission Link</div>
        </div>
        <div className="font-body text-[12px] text-[var(--app-text-muted)] leading-relaxed mb-4">
          Send this link to importers who may qualify for a tariff refund. Deals are tracked to your account.
        </div>
        <div className={`flex ${device.isMobile ? "flex-col" : "flex-row items-center"} gap-3`}>
          <div className="flex-1 bg-[#c4a050]/5 border border-[#c4a050]/30 rounded-lg px-4 py-3 font-mono text-[13px] text-[var(--app-text-secondary)] truncate select-all min-w-0">
            {clientRefUrl}
          </div>
          <CopyButton text={clientRefUrl} color="#c4a050" />
        </div>
      </div>

      {/* ═══ PARTNER RECRUITMENT — PRE-LOADED RATE LINKS ═══ */}
      {canRecruit && (
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
                const link = inv ? `${baseUrl}/signup?token=${inv.token}` : "Generating...";

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
      {canRecruit && (
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

      {/* ═══ INVITE TRACKING TABLE ═══ */}
      {canRecruit && allInvites.length > 0 && (
        <div className="card mb-6">
          <div className={`${device.cardPadding} border-b`} style={{ borderColor: "var(--app-border)" }}>
            <div className="font-body font-semibold text-[15px]">Invite Tracking ({allInvites.length})</div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)]">Track the status of your partner recruitment invites.</div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left font-body text-sm" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-center" style={{ width: inviteCols[0], position: "relative" }}>Rate<span {...inviteResize(0)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: inviteCols[1], position: "relative" }}>Tier<span {...inviteResize(1)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: inviteCols[2], position: "relative" }}>Status<span {...inviteResize(2)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: inviteCols[3], position: "relative" }}>Created<span {...inviteResize(3)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: inviteCols[4], position: "relative" }}>Used By<span {...inviteResize(4)} /></th>
                  <th className="px-4 py-3 text-center" style={{ width: inviteCols[5], position: "relative" }}>Action<span {...inviteResize(5)} /></th>
                </tr>
              </thead>
              <tbody>
                {allInvites.map((inv, idx) => (
                  <tr key={inv.id} className={`border-b border-[var(--app-border)] ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                    <td className="px-4 py-3 font-semibold text-brand-gold">{Math.round(inv.commissionRate * 100)}%</td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">{inv.targetTier.toUpperCase()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase ${
                        inv.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : inv.status === "used" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-muted)] text-[12px]">
                      {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-[var(--app-text-secondary)] text-[12px]">
                      {inv.usedByPartnerCode || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.status === "active" && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${baseUrl}/signup?token=${inv.token}`);
                            setCopiedRate(inv.commissionRate);
                            setTimeout(() => setCopiedRate(null), 2000);
                          }}
                          className={`font-body text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                            copiedRate === inv.commissionRate
                              ? "bg-green-500/15 border-green-500/30 text-green-400"
                              : "border-brand-gold/20 text-brand-gold/70 hover:bg-brand-gold/10"
                          }`}
                        >
                          {copiedRate === inv.commissionRate ? "Copied!" : "Copy Link"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--app-border)]">
            {allInvites.map((inv, idx) => (
              <div key={inv.id} className={`px-4 py-3 ${idx % 2 === 1 ? "bg-[rgba(59,130,246,0.03)]" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-bold text-brand-gold">{Math.round(inv.commissionRate * 100)}%</span>
                    <span className="font-body text-[10px] text-[var(--app-text-muted)]">{inv.targetTier.toUpperCase()}</span>
                  </div>
                  <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase ${
                    inv.status === "active" ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : inv.status === "used" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
                  }`}>
                    {inv.status}
                  </span>
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                  {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {inv.usedByPartnerCode && ` · Used by ${inv.usedByPartnerCode}`}
                </div>
                {inv.status === "active" && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${baseUrl}/signup?token=${inv.token}`);
                      setCopiedRate(inv.commissionRate);
                      setTimeout(() => setCopiedRate(null), 2000);
                    }}
                    className={`mt-2 font-body text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                      copiedRate === inv.commissionRate
                        ? "bg-green-500/15 border-green-500/30 text-green-400"
                        : "border-brand-gold/20 text-brand-gold/70 hover:bg-brand-gold/10"
                    }`}
                  >
                    {copiedRate === inv.commissionRate ? "Copied!" : "Copy Link"}
                  </button>
                )}
              </div>
            ))}
          </div>
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
