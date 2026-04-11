"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import CopyButton from "@/components/ui/CopyButton";
import { FIRM_SHORT, FIRM_PHONE, MAX_COMMISSION_RATE, ALLOWED_L2_RATES, ALLOWED_L3_RATES } from "@/lib/constants";

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
  const { data: session } = useSession();
  const device = useDevice();
  const partnerCode = (session?.user as any)?.partnerCode || "DEMO";

  const [invites, setInvites] = useState<Invite[]>([]);
  const [partnerTier, setPartnerTier] = useState("l1");
  const [partnerRate, setPartnerRate] = useState(0.25);
  const [l3Enabled, setL3Enabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://trln.partners";
  const clientRefUrl = `https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content=${partnerCode}`;

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
        setPartnerTier(data.partner?.tier || "l1");
        setPartnerRate(data.partner?.commissionRate || 0.25);
        setL3Enabled(data.l3Enabled || false);
      }
    } catch {}
  }, []);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const generateInvite = async (rate: number) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate }),
      });
      if (res.ok) {
        await loadInvites();
      }
    } catch {} finally {
      setGenerating(false);
    }
  };

  const copyInviteLink = (token: string) => {
    navigator.clipboard.writeText(`${baseUrl}/signup?token=${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Determine which rates this partner can offer
  const canRecruit = partnerTier === "l1" || (partnerTier === "l2" && l3Enabled);
  const availableRates = partnerTier === "l1"
    ? ALLOWED_L2_RATES
    : ALLOWED_L3_RATES.filter((r) => r < partnerRate);
  const targetTierLabel = partnerTier === "l1" ? "L2" : "L3";

  const activeInvites = invites.filter((i) => i.status === "active");

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        Referral Links
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Share client links and recruit partners to your downline.
      </p>

      {/* ═══ CLIENT SUBMISSION LINK ═══ */}
      <div className={`card ${device.cardPadding} border border-[#c4a050]/30 mb-6`}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{"\uD83D\uDCE9"}</span>
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

      {/* ═══ PARTNER RECRUITMENT ═══ */}
      {canRecruit && (
        <div className="card mb-6">
          <div className={`${device.cardPadding} border-b`} style={{ borderColor: "var(--app-border)" }}>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">{"\uD83D\uDC65"}</span>
              <div className="font-body font-semibold text-[15px]">Recruit {targetTierLabel} Partners</div>
            </div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)] leading-relaxed">
              Generate a recruitment link with a pre-set commission rate. You earn the override (difference between {Math.round(MAX_COMMISSION_RATE * 100)}% and their rate).
            </div>
          </div>

          {/* Rate selector */}
          <div className={`${device.cardPadding}`}>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">
              Choose commission rate for new {targetTierLabel} partner
            </div>
            <div className={`grid ${device.isMobile ? "grid-cols-1" : `grid-cols-${availableRates.length}`} gap-3 mb-4`}>
              {availableRates.map((rate) => {
                const pct = Math.round(rate * 100);
                const overridePct = partnerTier === "l1"
                  ? Math.round((MAX_COMMISSION_RATE - rate) * 100)
                  : Math.round((partnerRate - rate) * 100);
                return (
                  <button
                    key={rate}
                    onClick={() => generateInvite(rate)}
                    disabled={generating}
                    className="card p-4 text-center hover:border-brand-gold/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <div className="font-display text-2xl font-bold text-brand-gold mb-1">{pct}%</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">for {targetTierLabel} partner</div>
                    <div className="font-body text-[10px] text-green-400 bg-green-500/10 rounded-full px-2 py-0.5 inline-block">
                      You earn {overridePct}% override
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active invite links */}
            {activeInvites.length > 0 && (
              <div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-2">
                  Active Recruitment Links
                </div>
                <div className="space-y-2">
                  {activeInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--app-input-bg)", border: "1px solid var(--app-border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[12px] text-[var(--app-text-secondary)] truncate">
                          {baseUrl}/signup?token={inv.token}
                        </div>
                        <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5">
                          {inv.targetTier.toUpperCase()} at {Math.round(inv.commissionRate * 100)}% &middot; {inv.status}
                        </div>
                      </div>
                      <button
                        onClick={() => copyInviteLink(inv.token)}
                        className={`font-body text-[11px] px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
                          copiedToken === inv.token
                            ? "bg-green-500/15 border-green-500/30 text-green-400"
                            : "border-brand-gold/20 text-brand-gold/70 hover:bg-brand-gold/10"
                        }`}
                      >
                        {copiedToken === inv.token ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* L3 partners can't recruit */}
      {partnerTier === "l3" && (
        <div className="card p-5 mb-6 text-center">
          <div className="font-body text-[13px] text-[var(--app-text-muted)]">
            Partner recruitment is not available for L3 partners.
          </div>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="card px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">
          Your partner code: <span className="text-brand-gold font-semibold tracking-wider">{partnerCode}</span>
          <span className="ml-2 text-[var(--app-text-faint)]">&middot; {partnerTier.toUpperCase()} at {Math.round(partnerRate * 100)}%</span>
        </div>
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">
          {FIRM_SHORT} Support: <span className="text-[var(--app-text-secondary)]">{FIRM_PHONE}</span>
        </div>
      </div>
    </div>
  );
}
