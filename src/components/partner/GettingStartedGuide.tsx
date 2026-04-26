"use client";

import { useState } from "react";
import Link from "next/link";

interface GuideStep {
  id: string;
  number: number;
  title: string;
  summary: string;
  details: string[];
  tips?: string[];
  whereToFind: string;
  whereToFindHref: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: "sign_agreement",
    number: 1,
    title: "Sign Your Partnership Agreement",
    summary:
      "Your partnership agreement is a digital contract between you and Fintella. It locks in your commission rate and activates your portal access.",
    details: [
      "After you sign up, you'll receive a link to review and e-sign your partnership agreement through our secure signing platform.",
      "Read through the agreement carefully — it outlines your commission rate, payout terms, and the responsibilities of both parties.",
      "Sign it digitally right from your browser. No printing, scanning, or mailing required.",
      "Once both you and Fintella have signed, your account status changes from \"Pending\" to \"Active\" and the rest of your portal unlocks.",
    ],
    tips: [
      "If you don't see the signing link, check your email or ask your upline partner.",
      "Your commission rate is set at the time of invitation and reflected in the agreement.",
    ],
    whereToFind: "Documents tab in your dashboard",
    whereToFindHref: "/dashboard/reporting?tab=documents",
  },
  {
    id: "complete_profile",
    number: 2,
    title: "Fill Out Your Profile Information",
    summary:
      "Your profile information is used for tax documents, payout delivery, and your partnership records.",
    details: [
      "Go to Settings in your dashboard sidebar and select the Address tab.",
      "Enter your full mailing address — street, city, state, and zip code.",
      "This address is used to generate your 1099 tax form at year-end and to mail any physical correspondence.",
      "If you have a company name or Tax Identification Number (TIN), you can add those under Personal Information.",
    ],
    tips: [
      "Use your legal name and business address exactly as they appear on your tax records.",
      "You can update your information anytime, but changes to your legal name may require a new agreement.",
    ],
    whereToFind: "Settings → Address tab",
    whereToFindHref: "/dashboard/settings?tab=address",
  },
  {
    id: "add_payout",
    number: 3,
    title: "Set Up How You Get Paid",
    summary:
      "Before you can receive commission payments, you need to tell us where to send the money.",
    details: [
      "Navigate to Settings → Payout Information in your dashboard.",
      "Choose your preferred payout method: Bank Transfer (ACH), Wire Transfer, Check, or PayPal.",
      "For bank transfers, you'll need your bank name, routing number, and account number.",
      "For PayPal, just enter the email address linked to your PayPal account.",
      "Once your information is saved, you're eligible to receive commission payments as soon as your first deal closes.",
    ],
    tips: [
      "Double-check your routing and account numbers — incorrect information can delay payouts.",
      "Bank transfer (ACH) is the fastest payout method for most partners.",
      "You can change your payout method at any time without affecting pending commissions.",
    ],
    whereToFind: "Settings → Payout Information tab",
    whereToFindHref: "/dashboard/settings?tab=payout",
  },
  {
    id: "watch_video",
    number: 4,
    title: "Watch the Welcome Video",
    summary:
      "Get oriented in under five minutes. The welcome video walks you through every section of your partner portal.",
    details: [
      "Head to your Home page — the welcome video is embedded right at the top.",
      "The video covers how to navigate your dashboard, where key features live, and the basic flow of submitting a referral.",
      "You'll see how a referral moves from submission through qualification to a closed deal — and how your commission is tracked at each stage.",
    ],
    tips: [
      "Watch it once all the way through, then come back to specific sections as you need them.",
      "Share the video with any downline partners you recruit — it's the fastest way to get them up to speed.",
    ],
    whereToFind: "Home page (top of dashboard)",
    whereToFindHref: "/dashboard/home",
  },
  {
    id: "join_call",
    number: 5,
    title: "Join a Live Weekly Call",
    summary:
      "The Live Weekly call is your best resource for learning, strategy, and staying connected to the Fintella community.",
    details: [
      "Every week, Fintella hosts a live call open to all partners. Check the Conference page in your dashboard for the next scheduled date and time.",
      "On the call, leadership shares product updates, top partners share what's working, and you can ask questions live.",
      "Calls typically last 30–45 minutes. You can join from your computer or phone — just click the Join button when the call is live.",
      "Past call recordings are available on the Conference page so you can catch up if you miss one.",
    ],
    tips: [
      "Set a weekly reminder so you don't forget. Consistency matters more than perfect attendance.",
      "Come with questions — this is your direct line to leadership and top-performing partners.",
      "Add the call to your calendar directly from the Conference page.",
    ],
    whereToFind: "Conference page in your dashboard sidebar",
    whereToFindHref: "/dashboard/conference",
  },
  {
    id: "complete_training",
    number: 6,
    title: "Complete a Training Module",
    summary:
      "Training modules teach you the product, sharpen your pitch, and give you the confidence to talk to potential clients.",
    details: [
      "Go to Partner Training from your dashboard sidebar. You'll see a library of modules organized by category: Onboarding, Sales, Product Knowledge, and Tools.",
      "Each module includes a short description, estimated completion time, and — for some — a video walkthrough.",
      "Start with an onboarding module like \"Understanding Tariff Recovery\" to learn the fundamentals of the IEEPA tariff refund product.",
      "When you finish a module, click \"Mark Complete\" to track your progress. The system records your completion date automatically.",
    ],
    tips: [
      "You only need to complete one module to check this step off, but the more you complete, the better prepared you'll be.",
      "Check the Resources tab for downloadable guides, checklists, and conversation scripts you can use with clients.",
      "The FAQ section answers the most common questions partners and clients ask.",
    ],
    whereToFind: "Partner Training page in your dashboard sidebar",
    whereToFindHref: "/dashboard/training",
  },
  {
    id: "share_link",
    number: 7,
    title: "Share Your Referral Link",
    summary:
      "Your referral link is how the system knows a client came from you. Every deal submitted through your link is automatically tracked to your account.",
    details: [
      "Go to Referral Links from your dashboard sidebar.",
      "You'll see your unique referral URL — click the copy button to grab it.",
      "Share this link with potential clients via email, text, social media, or in conversation. When they click it and submit their information, the referral is attributed to you.",
      "The link never expires and works an unlimited number of times.",
    ],
    tips: [
      "Bookmark your referral link for quick access.",
      "When talking to a potential client, send them the link right away so they can submit while the conversation is fresh.",
      "You can create different invite links for downline partners with different commission rates — but your client referral link is always the same.",
    ],
    whereToFind: "Referral Links page in your dashboard sidebar",
    whereToFindHref: "/dashboard/referral-links",
  },
  {
    id: "submit_client",
    number: 8,
    title: "Submit Your First Client Referral",
    summary:
      "This is where you start earning. When you have a business that imports goods and may qualify for a tariff refund, submit them here.",
    details: [
      "Click Submit Client in your dashboard sidebar to open the referral submission form.",
      "Fill in the client's business name, contact information, and estimated annual import value.",
      "Add any notes that might help the recovery team — the types of products they import, their industry, or how you know them.",
      "Hit submit. The referral enters as a \"New Lead\" and you can track its progress from your Reporting tab.",
      "As the deal moves through stages — Qualified, Meeting Booked, Client Engaged — you'll see status updates in real time.",
    ],
    tips: [
      "A qualified importer is any business that imports goods into the United States and has paid tariffs or duties in the last few years.",
      "Don't overthink it — if the business imports, submit the referral. The recovery team will determine qualification.",
      "You can submit as many referrals as you want. There's no limit.",
      "Check the Reporting tab regularly to see where your deals stand and when commissions are due.",
    ],
    whereToFind: "Submit Client page in your dashboard sidebar",
    whereToFindHref: "/dashboard/submit-client",
  },
  {
    id: "invite_downline",
    number: 9,
    title: "Recruit Your First Downline Partner",
    summary:
      "Build your team and multiply your earnings. When your downline partners close deals, you earn an override commission automatically.",
    details: [
      "Go to Referral Links and scroll to the downline partner section.",
      "Choose a commission rate for the partner you're inviting. Their rate must be lower than yours — the difference is your override.",
      "Click Create Invite Link to generate a unique signup URL for your recruit.",
      "Share the link with your recruit. When they sign up through it, they're automatically linked to your partner tree.",
      "Once they sign their agreement and start submitting referrals, you'll earn your override on every deal they close.",
    ],
    tips: [
      "Your override commission = your rate minus your downline's rate. For example, if you're at 20% and you set them at 15%, you earn a 5% override on their deals.",
      "Look for people with strong networks in industries that import goods — freight brokers, trade consultants, import/export businesses, accountants, and attorneys.",
      "You can track all of your downline partners and their deal activity from the Downline tab in Reporting.",
      "Help your recruits complete their own Getting Started checklist — the faster they're active, the sooner you both earn.",
    ],
    whereToFind: "Referral Links page → Downline section",
    whereToFindHref: "/dashboard/referral-links",
  },
];

export function GettingStartedGuide() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h2 className="font-display text-lg sm:text-xl font-semibold text-[var(--app-text)] mb-1">
        Step-by-Step Guide
      </h2>
      <p className="font-body text-[13px] text-[var(--app-text-secondary)] mb-5 leading-relaxed">
        Tap any step below for detailed instructions on exactly what to do and where to find it in your portal.
      </p>

      <div className="space-y-3">
        {GUIDE_STEPS.map((step) => {
          const isOpen = expandedId === step.id;
          return (
            <div
              key={step.id}
              className="card border-[var(--app-border)] overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(isOpen ? null : step.id)}
                className="w-full flex items-start gap-3 p-4 sm:p-5 text-left hover:bg-[var(--app-input-bg)]/50 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-brand-gold text-black font-display text-[13px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step.number}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-[14px] sm:text-[15px] font-semibold text-[var(--app-text)]">
                    {step.title}
                  </div>
                  <div className="font-body text-[12px] sm:text-[13px] text-[var(--app-text-secondary)] mt-0.5 leading-snug">
                    {step.summary}
                  </div>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className={`w-5 h-5 shrink-0 mt-1 text-[var(--app-text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M5 7.5l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {isOpen && (
                <div className="px-4 sm:px-5 pb-5 pt-0 border-t border-[var(--app-border)]">
                  <div className="pt-4 space-y-4">
                    <div>
                      <h4 className="font-display text-[13px] font-semibold text-brand-gold uppercase tracking-[1px] mb-2">
                        What to do
                      </h4>
                      <ol className="list-decimal pl-5 space-y-1.5">
                        {step.details.map((detail, i) => (
                          <li
                            key={i}
                            className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed"
                          >
                            {detail}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {step.tips && step.tips.length > 0 && (
                      <div className="rounded-lg bg-brand-gold/[0.06] border border-brand-gold/20 p-3 sm:p-4">
                        <h4 className="font-display text-[12px] font-semibold text-brand-gold uppercase tracking-[1px] mb-1.5">
                          Tips
                        </h4>
                        <ul className="list-disc pl-4 space-y-1">
                          {step.tips.map((tip, i) => (
                            <li
                              key={i}
                              className="font-body text-[12px] sm:text-[13px] text-[var(--app-text-secondary)] leading-relaxed"
                            >
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <span className="font-body text-[11px] uppercase tracking-[1px] text-[var(--app-text-muted)]">
                        Where to find it:
                      </span>
                      <Link
                        href={step.whereToFindHref}
                        className="font-body text-[12px] sm:text-[13px] font-medium text-brand-gold hover:text-brand-gold/80 underline underline-offset-2 transition-colors"
                      >
                        {step.whereToFind} →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
