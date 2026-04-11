"use client";

import { useSession } from "next-auth/react";
import { useDevice } from "@/lib/useDevice";
import CopyButton from "@/components/ui/CopyButton";
import { FIRM_SHORT, FIRM_PHONE } from "@/lib/constants";

export default function ReferralLinksPage() {
  const { data: session } = useSession();
  const device = useDevice();
  const partnerCode = (session?.user as any)?.partnerCode || "DEMO";

  const clientRefUrl = `https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content=${partnerCode}`;

  const links = [
    {
      icon: "\uD83D\uDCE9",
      title: "Client Submission Link",
      description:
        "Send this link to importers who may qualify for a tariff refund. When they submit through your link, the deal is tracked to your account and downline.",
      url: clientRefUrl,
      color: "#c4a050",
      borderColor: "border-[#c4a050]/30",
      bgColor: "bg-[#c4a050]/5",
    },
    {
      icon: "\uD83D\uDC65",
      title: "Partner Recruitment Link",
      description:
        "Share this with CPAs, trade advisors, and attorneys who want to earn commissions by referring their own clients. They join your downline.",
      url: `https://trln.com/partner?utm_content=${partnerCode}`,
      color: "#a78bfa",
      borderColor: "border-[#a78bfa]/30",
      bgColor: "bg-[#a78bfa]/5",
    },
  ];

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        Referral Links
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Share these links to earn commissions on every deal and recruit partners
        to your downline.
      </p>

      <div className={`flex flex-col ${device.gap}`}>
        {links.map((link) => (
          <div
            key={link.title}
            className={`card ${device.cardPadding} border ${link.borderColor}`}
            style={{ borderRadius: device.borderRadius.replace("rounded-", "") }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{link.icon}</span>
              <div className="font-body font-semibold text-[15px] text-[var(--app-text)]">
                {link.title}
              </div>
            </div>

            {/* Description */}
            <div className="font-body text-[12px] text-[var(--app-text-muted)] leading-relaxed mb-4">
              {link.description}
            </div>

            {/* URL + Copy */}
            <div
              className={`flex ${
                device.isMobile ? "flex-col" : "flex-row items-center"
              } gap-3`}
            >
              <div
                className={`flex-1 ${link.bgColor} border ${link.borderColor} rounded-lg px-4 py-3 font-mono text-[13px] text-[var(--app-text-secondary)] truncate select-all min-w-0`}
              >
                {link.url}
              </div>
              <CopyButton text={link.url} color={link.color} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom info bar */}
      <div className="mt-6 card px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">
          Your partner code:{" "}
          <span className="text-brand-gold font-semibold tracking-wider">
            {partnerCode}
          </span>
        </div>
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">
          {FIRM_SHORT} Support:{" "}
          <span className="text-[var(--app-text-secondary)]">{FIRM_PHONE}</span>
        </div>
      </div>
    </div>
  );
}
