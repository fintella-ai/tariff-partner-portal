import type { Metadata } from "next";
import Link from "next/link";
import RecoverForm from "@/components/landing/RecoverForm";
import GatedResources from "@/components/landing/GatedResources";

export const metadata: Metadata = {
  title: "Find Out How Much You're Owed — IEEPA Tariff Refund Recovery",
  description: "US importers have overpaid $166 billion in tariff duties. 83% haven't filed yet. Use our free calculator to estimate your refund.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Find Out How Much You're Owed — Tariff Refund Recovery",
    description: "The Supreme Court ruled IEEPA tariffs unlawful. $166B in refunds are available. Check your eligibility in 60 seconds.",
    type: "website",
  },
};

export default function RecoverPage({
  searchParams,
}: {
  searchParams: { ref?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string };
}) {
  const partnerCode = searchParams.ref || searchParams.utm_content || null;

  return (
    <main className="min-h-screen bg-[#060a14] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="font-display text-xl" style={{ color: "#c4a050" }}>Fintella</div>
          <Link href="/login" className="text-sm text-white/50 hover:text-white/80 transition">Partner Login</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: Message */}
          <div>
            <div className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase bg-red-500/10 text-red-400 border border-red-500/20 mb-6">
              $22 Million in Interest Accrues Daily
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6" style={{ color: "#c4a050" }}>
              Find Out How Much You&apos;re Owed in Tariff Refunds
            </h1>
            <p className="text-lg text-white/70 mb-8 leading-relaxed">
              The Supreme Court ruled IEEPA tariffs unlawful. <strong className="text-white">$166 billion</strong> in refunds are available to US importers. <strong className="text-white">83% haven&apos;t filed yet.</strong>
            </p>
            <div className="space-y-4 text-white/60 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>No upfront cost — the firm advances all filing fees</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>No recovery, no fee — you only pay if you get money back</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>60-90 day processing through CBP&apos;s CAPE portal</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>Two co-counsel law firms handling your claim</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-10">
              <div className="text-center">
                <div className="font-display text-2xl font-bold" style={{ color: "#c4a050" }}>$166B</div>
                <div className="text-xs text-white/40 mt-1">Refunds Owed</div>
              </div>
              <div className="text-center">
                <div className="font-display text-2xl font-bold" style={{ color: "#c4a050" }}>330K</div>
                <div className="text-xs text-white/40 mt-1">Eligible Importers</div>
              </div>
              <div className="text-center">
                <div className="font-display text-2xl font-bold" style={{ color: "#c4a050" }}>83%</div>
                <div className="text-xs text-white/40 mt-1">Haven&apos;t Filed</div>
              </div>
            </div>
          </div>

          {/* Right: Calculator Form */}
          <div>
            <RecoverForm partnerCode={partnerCode} />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-10" style={{ color: "#c4a050" }}>How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">1</div>
              <h3 className="font-semibold text-sm mb-2">Estimate Your Refund</h3>
              <p className="text-xs text-white/50">Enter your approximate annual tariff duties. We&apos;ll show you what you could recover.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">2</div>
              <h3 className="font-semibold text-sm mb-2">Book a Free Call</h3>
              <p className="text-xs text-white/50">A specialist reviews your import history and confirms eligibility. No obligation.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">3</div>
              <h3 className="font-semibold text-sm mb-2">Get Your Money Back</h3>
              <p className="text-xs text-white/50">Our legal team files through CAPE. You get your refund in 60-90 days. No upfront cost.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Free Resources — gated behind lead capture */}
      <GatedResources partnerCode={partnerCode} />

      {/* Footer */}
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-white/30">
          <p>© {new Date().getFullYear()} Fintella — Financial Intelligence Network. All rights reserved.</p>
          <p className="mt-2">This is not legal advice. Recovery amounts are estimates. Actual refunds depend on your import history and claim eligibility.</p>
          <div className="mt-3 flex justify-center gap-4">
            <Link href="/privacy" className="hover:text-white/50 transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white/50 transition">Terms</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
