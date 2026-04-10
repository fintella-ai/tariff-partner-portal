"use client";

import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import { useState } from "react";

export default function SubmitClientPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const user = session?.user as any;
  const partnerCode = user?.partnerCode || "DEMO";
  const partnerName = user?.name || "Partner";
  const [copiedLink, setCopiedLink] = useState(false);

  const referralUrl = `https://referral.frostlawaz.com/l/ANNEXATIONPR/?REFERRALCODE=${partnerCode}`;

  function copyReferralLink() {
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">
        Submit a Client
      </h2>
      <p className="font-body text-sm text-white/40 mb-5">
        Use the form below to submit a client referral. This submission is tracked to your partner account.
      </p>

      {/* Partner info bar */}
      <div className={`card ${device.cardPadding} ${device.borderRadius} border border-brand-gold/20 mb-1`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-gold/15 border border-brand-gold/25 flex items-center justify-center font-display text-xs font-bold text-brand-gold">
              {partnerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="font-body text-sm font-semibold text-white">{partnerName}</div>
              <div className="font-body text-[11px] text-white/40 tracking-wider">{partnerCode}</div>
            </div>
          </div>
          <button
            onClick={copyReferralLink}
            className={`font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2.5 transition-all ${
              copiedLink
                ? "bg-green-500/15 border-green-500/30 text-green-400"
                : "bg-white/5 border-white/15 text-white/60 hover:bg-white/10 hover:text-white/80"
            }`}
          >
            {copiedLink ? "Copied!" : "Copy Referral Link"}
          </button>
        </div>
      </div>

      {/* Tracking badge */}
      <div className="mb-4 px-1">
        <div className="font-body text-[12px] text-white/40">
          Client Submission Form &mdash; tracked to{" "}
          <span className="text-brand-gold font-semibold">{partnerCode}</span>
        </div>
      </div>

      {/* Frost Law referral form iframe */}
      <div className={`card ${device.borderRadius} border border-white/[0.08] overflow-hidden`}>
        {/* Open in new tab bar */}
        <div className="flex justify-end px-4 py-2 border-b border-white/[0.06]">
          <a
            href={referralUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-[12px] text-white/40 hover:text-white/60 transition-colors flex items-center gap-1"
          >
            Open in new tab
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
        <iframe
          src={referralUrl}
          className="w-full border-0"
          style={{ minHeight: device.isMobile ? "700px" : "900px" }}
          title="Frost Law Client Referral Form"
          allow="forms"
        />
      </div>
    </div>
  );
}
