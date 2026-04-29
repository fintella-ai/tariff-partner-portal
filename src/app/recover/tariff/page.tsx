import type { Metadata } from "next";
import Link from "next/link";
import RecoverForm from "@/components/landing/RecoverForm";

export const metadata: Metadata = {
  title: "Claim Your IEEPA Tariff Refund — $166B Available",
  description: "US importers have overpaid billions in tariff duties. Free 60-second eligibility check. No obligation.",
  robots: { index: true, follow: true },
};

export default function TariffRecoverPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const partnerCode = searchParams.ref || searchParams.utm_content || null;
  const utmParams = {
    utm_source: searchParams.utm_source || null,
    utm_medium: searchParams.utm_medium || null,
    utm_campaign: searchParams.utm_campaign || null,
    utm_content: searchParams.utm_content || null,
    utm_term: searchParams.utm_term || null,
    utm_adgroup: searchParams.utm_adgroup || null,
  };

  return (
    <main className="min-h-screen bg-[#060a14] text-white">
      <nav className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-display text-xl" style={{ color: "#c4a050" }}>Fintella</div>
          <Link href="/login" className="text-sm text-white/50 hover:text-white/80 transition">Partner Login</Link>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <div className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase bg-red-500/10 text-red-400 border border-red-500/20 mb-6">
              Supreme Court Ruling — Refunds Available Now
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6" style={{ color: "#c4a050" }}>
              Claim Your IEEPA Tariff Refund
            </h1>
            <p className="text-lg text-white/70 mb-8 leading-relaxed">
              The Supreme Court ruled IEEPA tariffs unlawful. <strong className="text-white">$166 billion</strong> in refunds are available to US importers. Check your eligibility in 60 seconds — no obligation.
            </p>
            <div className="space-y-3 text-white/60 text-sm mb-8">
              <div className="flex items-center gap-3"><span className="text-green-400">✓</span> Free eligibility assessment</div>
              <div className="flex items-center gap-3"><span className="text-green-400">✓</span> No upfront costs — contingency only</div>
              <div className="flex items-center gap-3"><span className="text-green-400">✓</span> Average refund: $200K–$5M per importer</div>
              <div className="flex items-center gap-3"><span className="text-green-400">✓</span> 60-90 day processing via CBP CAPE portal</div>
            </div>
          </div>
          <RecoverForm partnerCode={partnerCode} utmParams={utmParams} />
        </div>
      </div>
    </main>
  );
}
