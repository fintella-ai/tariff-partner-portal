"use client";

import { useEffect, useState } from "react";
import type { GettingStartedResult } from "@/lib/getting-started";
import { GettingStartedChecklist } from "@/components/partner/GettingStartedChecklist";
import { PartnerExpectations } from "@/components/partner/PartnerExpectations";
import { GettingStartedGuide } from "@/components/partner/GettingStartedGuide";
import { FIRM_SHORT } from "@/lib/constants";

export default function GettingStartedPage() {
  const [firstName, setFirstName] = useState<string>("");
  const [data, setData] = useState<GettingStartedResult | null>(null);

  useEffect(() => {
    fetch("/api/partner/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.partner?.firstName) setFirstName(d.partner.firstName);
      })
      .catch(() => {});
    fetch("/api/partner/getting-started", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GettingStartedResult | null) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  const completed = data && data.completedCount === data.totalCount && data.totalCount > 0;

  return (
    <div className="max-w-4xl mx-auto text-left">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--app-text)]">
          {completed
            ? `You're all set, ${firstName || "partner"} 🎉`
            : firstName
              ? `Welcome, ${firstName} — let's get you earning`
              : `Welcome to ${FIRM_SHORT} — let's get you earning`}
        </h1>
        <p className="font-body text-[14px] text-[var(--app-text-secondary)] mt-2 leading-relaxed max-w-2xl">
          {completed
            ? "You've completed every getting-started step. Keep momentum with your Live Weekly calls, continue submitting referrals, and watch for new opportunities in your inbox."
            : "Complete the steps below to activate your account, set up your payouts, and submit your first referral. Most partners finish in under 15 minutes."}
        </p>
      </div>

      <div className="mb-8">
        <GettingStartedChecklist variant="page" />
      </div>

      <div className="mb-10">
        <GettingStartedGuide />
      </div>

      <div className="mb-8">
        <PartnerExpectations markdown={data?.expectationsMarkdown} />
      </div>

      <div className="mb-8">
        <div className="card p-6 sm:p-8 border-brand-gold/30 bg-brand-gold/[0.04]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex-1">
              <h2 className="font-display text-lg sm:text-xl font-semibold text-brand-gold mb-1">
                Join this week's Live Weekly call
              </h2>
              <p className="font-body text-[13px] sm:text-[14px] text-[var(--app-text-secondary)] leading-relaxed">
                The fastest way to learn the product, hear what's working for other partners, and get your questions answered live. Every {FIRM_SHORT} partner should join at least one call a month.
              </p>
            </div>
            <a
              href="/dashboard/conference"
              className="inline-block bg-brand-gold text-black font-semibold font-body text-[12px] tracking-[1px] uppercase rounded-lg px-6 py-3 hover:bg-brand-gold/90 transition-colors text-center shrink-0"
            >
              See schedule
            </a>
          </div>
        </div>
      </div>

      <div className="mb-12">
        <div className="card p-6 sm:p-8">
          <h2 className="font-display text-lg sm:text-xl font-semibold text-[var(--app-text)] mb-3">
            Need help?
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <a
              href="/dashboard/training"
              className="rounded-lg border border-[var(--app-border)] p-4 hover:bg-[var(--app-input-bg)]/50 transition-colors block"
            >
              <div className="text-xl mb-2">📖</div>
              <div className="font-display text-[13px] font-semibold text-[var(--app-text)] mb-0.5">Training Library</div>
              <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-snug">
                Video walkthroughs, guides, and FAQs
              </div>
            </a>
            <a
              href="/dashboard/conference"
              className="rounded-lg border border-[var(--app-border)] p-4 hover:bg-[var(--app-input-bg)]/50 transition-colors block"
            >
              <div className="text-xl mb-2">📹</div>
              <div className="font-display text-[13px] font-semibold text-[var(--app-text)] mb-0.5">Weekly Call Recordings</div>
              <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-snug">
                Catch up on past sessions and strategies
              </div>
            </a>
            <a
              href="/dashboard/support"
              className="rounded-lg border border-[var(--app-border)] p-4 hover:bg-[var(--app-input-bg)]/50 transition-colors block"
            >
              <div className="text-xl mb-2">💬</div>
              <div className="font-display text-[13px] font-semibold text-[var(--app-text)] mb-0.5">Contact Support</div>
              <div className="font-body text-[12px] text-[var(--app-text-secondary)] leading-snug">
                Reach the team for account or portal questions
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
