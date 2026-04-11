"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import { FIRM_SHORT } from "@/lib/constants";

const BASE_REFERRAL_URL = "https://referral.frostlawaz.com/l/ANNEXATIONPR/";

export default function SubmitClientPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const router = useRouter();
  const user = session?.user as any;
  const partnerCode = user?.partnerCode || "DEMO";
  const partnerName = user?.name || "Partner";
  const [agreementSigned, setAgreementSigned] = useState<boolean | null>(null);

  // ── Fetch agreement status ────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/agreement")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setAgreementSigned(data.agreement?.status === "signed");
      })
      .catch(() => {
        // If API fails, default to allowing access (demo mode)
        setAgreementSigned(true);
      });
  }, []);

  // Build the referral URL with the partner's code
  const referralUrl = `${BASE_REFERRAL_URL}?REFERRALCODE=${partnerCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralUrl);
  };

  if (agreementSigned === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-white/40">Checking agreement status...</div>
      </div>
    );
  }

  if (!agreementSigned) {
    return (
      <div>
        <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
          Submit a Client
        </h2>
        <p className="font-body text-[13px] text-white/40 mb-4">
          Use the form below to submit a client referral. This submission is tracked to your partner account.
        </p>

        <div
          className={`card ${device.cardPadding} ${device.borderRadius} border border-yellow-500/25`}
        >
          <div className="text-center py-6">
            {/* Lock icon */}
            <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>

            <h3 className="font-display text-lg sm:text-xl font-bold mb-2">
              Partnership Agreement Required
            </h3>
            <p className="font-body text-sm text-white/50 mb-6 max-w-md mx-auto leading-relaxed">
              You must sign your partnership agreement before submitting clients.
              Please visit the Documents tab to complete your agreement.
            </p>

            <button
              type="button"
              onClick={() => router.push("/dashboard/documents")}
              className="btn-gold w-full max-w-xs mx-auto"
            >
              Go to Documents &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Submit a Client
      </h2>
      <p className="font-body text-[13px] text-white/40 mb-4">
        Use the form below to submit a client referral. This submission is tracked to your partner account.
      </p>

      {/* Partner info bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-gold/10 border border-brand-gold/25 flex items-center justify-center">
            <span className="font-body text-[11px] font-bold text-brand-gold">
              {partnerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </span>
          </div>
          <div>
            <div className="font-body text-[13px] text-white/80 font-medium">{partnerName}</div>
            <div className="font-mono text-[11px] text-white/40">{partnerCode}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
          >
            Copy Referral Link
          </button>
        </div>
      </div>

      {/* Embedded referral form */}
      <div className={`card overflow-hidden ${device.borderRadius}`}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="font-body text-[12px] text-white/40">
            Client Submission Form — tracked to <span className="text-brand-gold font-semibold">{partnerCode}</span>
          </div>
          <a
            href={referralUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-[11px] text-white/30 hover:text-white/50 transition-colors"
          >
            Open in new tab ↗
          </a>
        </div>
        <div className="bg-white" style={{ height: device.isMobile ? "calc(100vh - 220px)" : "75vh" }}>
          <iframe
            src={referralUrl}
            className="w-full h-full border-0"
            title="Client Referral Submission"
            allow="camera; microphone; geolocation"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation"
          />
        </div>
      </div>

      {/* Info footer */}
      <div className="mt-4 font-body text-[11px] text-white/25 text-center leading-relaxed">
        All submissions through this form are automatically tracked to your partner account ({partnerCode}).
        <br />
        Your downline partners have their own unique links. Contact {FIRM_SHORT} support with any questions.
      </div>
    </div>
  );
}
