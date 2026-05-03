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
  const [isTrialMode, setIsTrialMode] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    fetch("/api/agreement")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const agreementOk =
          data.agreement?.status === "signed" ||
          data.agreement?.status === "approved";
        const partnerOk = data.partnerStatus === "active";
        const trialOk = (data.dealCount ?? 0) < 1;
        setAgreementSigned((agreementOk && partnerOk) || trialOk);
        setIsTrialMode(!agreementOk && trialOk);
      })
      .catch(() => {
        setAgreementSigned(true);
      });
  }, []);

  // Build the referral URL with the partner's code
  const referralUrl = `${BASE_REFERRAL_URL}?utm_content=${partnerCode}`;

  if (agreementSigned === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Checking agreement status...</div>
      </div>
    );
  }

  if (!agreementSigned) {
    return (
      <div>
        <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
          Submit a Client
        </h2>
        <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-4">
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
            <p className="font-body text-sm text-[var(--app-text-secondary)] mb-6 max-w-md mx-auto leading-relaxed">
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
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-4">
        Use the form below to submit a client referral. This submission is tracked to your partner account.
      </p>

      {isTrialMode && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="font-body text-[13px] text-amber-400 font-medium">You have 1 free trial referral</div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-1">Sign your partnership agreement to continue referring clients after this submission.</div>
        </div>
      )}

      {/* Partner info bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-gold/10 border border-brand-gold/25 flex items-center justify-center">
            <span className="font-body text-[11px] font-bold text-brand-gold">
              {partnerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
            </span>
          </div>
          <div>
            <div className="font-body text-[13px] text-[var(--app-text)] font-medium">{partnerName}</div>
            <div className="font-mono text-[11px] text-[var(--app-text-muted)]">{partnerCode}</div>
          </div>
        </div>
      </div>

      {/* Embedded referral form */}
      <div className={`card overflow-hidden ${device.borderRadius}`}>
        <div className="px-4 py-3 border-b border-[var(--app-border)] flex items-center justify-between gap-3">
          <div className="font-body text-[12px] text-[var(--app-text-muted)]">
            Client Submission Form — tracked to <span className="text-brand-gold font-semibold">{partnerCode}</span>
          </div>
          <button
            type="button"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Reset the form to submit another client"
            className="font-body text-[11px] text-brand-gold/80 border border-brand-gold/25 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors flex items-center gap-1.5 min-h-[32px]"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
        {/* Cropped iframe — hides Frost Law nav+hero at top and the footer /
            newsletter block at the bottom. Container height is the visible
            window; iframe is positioned absolute with a negative `top` to
            push the hero out of view and enough extra height to keep the
            form + calendar page scrollable without the footer leaking in.
            Dropped `allow-top-navigation` so the form's post-submit
            calendar redirect stays inside this iframe. */}
        <div
          className="overflow-hidden relative"
          style={{
            background: "#0c1630",
            height: device.isMobile ? "calc(100vh - 280px)" : "72vh",
            minHeight: 680,
          }}
        >
          <iframe
            key={iframeKey}
            src={referralUrl}
            className="w-full border-0 absolute"
            title="Client Referral Submission"
            allow="camera; microphone; geolocation"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            style={{
              top: device.isMobile ? -450 : -680,
              left: 0,
              width: "100%",
              height: device.isMobile ? "calc(100% + 800px)" : "calc(100% + 1100px)",
            }}
          />
        </div>
      </div>

      {/* Info footer */}
      <div className="mt-4 font-body text-[11px] text-[var(--app-text-faint)] text-center leading-relaxed">
        All submissions through this form are automatically tracked to your partner account ({partnerCode}).
        <br />
        Your downline partners have their own unique links. Contact {FIRM_SHORT} support with any questions.
      </div>
    </div>
  );
}
