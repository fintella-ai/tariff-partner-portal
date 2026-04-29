import type { Metadata } from "next";
import Link from "next/link";
import PartnerInterestForm from "@/components/landing/PartnerInterestForm";
import ScrollToTopCTA from "@/components/landing/ScrollToTopCTA";

export const metadata: Metadata = {
  title: "Become a Partner — Earn Commissions on Tariff Refund Referrals | Fintella",
  description: "Customs brokers and trade professionals: earn legal referral commissions on every IEEPA tariff recovery. Arizona-licensed counsel pays you directly. No cost to join.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Earn Commissions on Tariff Refund Referrals — Fintella Partner Program",
    description: "$166B in IEEPA refunds available. Your clients are owed money. Refer them through Fintella and earn on every recovery.",
    type: "website",
  },
};

export default function PartnersPage() {
  return (
    <main className="min-h-screen bg-[#060a14] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-xl" style={{ color: "#c4a050" }}>Fintella</Link>
          <div className="flex items-center gap-4">
            <Link href="/recover" className="text-sm text-white/40 hover:text-white/60 transition hidden sm:inline">Client Refund Calculator</Link>
            <Link href="/login" className="text-sm text-white/50 hover:text-white/80 transition">Partner Login</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: Pitch */}
          <div>
            <div className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase bg-green-500/10 text-green-400 border border-green-500/20 mb-6">
              Licensed Referral Commission Program
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6" style={{ color: "#c4a050" }}>
              Your Clients Are Owed Tariff Refunds. You Should Get Paid for That.
            </h1>
            <p className="text-lg text-white/70 mb-8 leading-relaxed">
              <strong className="text-white">$166 billion</strong> in IEEPA tariff refunds. <strong className="text-white">83% of eligible importers</strong> haven&apos;t filed. As a customs broker, you&apos;re the first call — and with Fintella, every referral earns you a commission.
            </p>

            <div className="space-y-4 text-white/60 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5 text-base">💰</span>
                <span><strong className="text-white">Legal referral commissions</strong> — our Arizona-based legal partner is licensed to pay referral fees directly to you</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5 text-base">🤝</span>
                <span><strong className="text-white">Your clients stay yours</strong> — we handle the legal filing behind the scenes. No poaching, no competition</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5 text-base">🚀</span>
                <span><strong className="text-white">Zero cost to join</strong> — no fees, no inventory, no risk. You refer, we recover, you earn</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5 text-base">📊</span>
                <span><strong className="text-white">Real-time partner portal</strong> — track every referral, claim status, and commission payment 24/7</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mt-10">
              <div className="text-center">
                <div className="font-display text-2xl font-bold" style={{ color: "#c4a050" }}>$166B</div>
                <div className="text-xs text-white/40 mt-1">Refunds Available</div>
              </div>
              <div className="text-center">
                <div className="font-display text-2xl font-bold" style={{ color: "#c4a050" }}>60–90</div>
                <div className="text-xs text-white/40 mt-1">Day Processing</div>
              </div>
              <div className="text-center">
                <div className="font-display text-2xl font-bold" style={{ color: "#c4a050" }}>$0</div>
                <div className="text-xs text-white/40 mt-1">Cost to Join</div>
              </div>
            </div>
          </div>

          {/* Right: Interest Form */}
          <div>
            <PartnerInterestForm />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-10" style={{ color: "#c4a050" }}>How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">1</div>
              <h3 className="font-semibold text-sm mb-2">Apply to Join</h3>
              <p className="text-xs text-white/50">Fill out the form above. We review your application and set up your partner account within 24 hours.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">2</div>
              <h3 className="font-semibold text-sm mb-2">Refer Your Clients</h3>
              <p className="text-xs text-white/50">Use your personalized referral link or submit clients directly through your partner portal.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">3</div>
              <h3 className="font-semibold text-sm mb-2">We Handle Recovery</h3>
              <p className="text-xs text-white/50">Our legal team files through CBP&apos;s CAPE portal. Your client gets their refund in 60-90 days.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">4</div>
              <h3 className="font-semibold text-sm mb-2">You Get Paid</h3>
              <p className="text-xs text-white/50">Earn a commission on every successful recovery. Paid directly — legally and compliantly.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Why Fintella */}
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-3" style={{ color: "#c4a050" }}>Why Brokers Choose Fintella</h2>
          <p className="text-sm text-white/40 text-center mb-10">We built this program specifically for customs brokers and trade professionals.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-white/10">
              <div className="text-2xl mb-3">⚖️</div>
              <h3 className="font-semibold text-sm text-white/90 mb-2">Legally Compliant Commissions</h3>
              <p className="text-xs text-white/40">Arizona law permits our legal partner to pay referral fees to licensed professionals. Every payment is structured, documented, and above-board.</p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10">
              <div className="text-2xl mb-3">🔒</div>
              <h3 className="font-semibold text-sm text-white/90 mb-2">Client Relationship Protected</h3>
              <p className="text-xs text-white/40">We never contact your clients directly or try to disintermediate the broker relationship. You remain their trusted advisor.</p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10">
              <div className="text-2xl mb-3">📈</div>
              <h3 className="font-semibold text-sm text-white/90 mb-2">New Revenue Stream</h3>
              <p className="text-xs text-white/40">Turn your existing client base into a new profit center. No additional overhead — just refer clients you already serve.</p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10">
              <div className="text-2xl mb-3">🏛️</div>
              <h3 className="font-semibold text-sm text-white/90 mb-2">Two Co-Counsel Law Firms</h3>
              <p className="text-xs text-white/40">Your clients&apos; claims are handled by experienced legal teams who specialize in tariff recovery through CBP&apos;s CAPE system.</p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10">
              <div className="text-2xl mb-3">⚡</div>
              <h3 className="font-semibold text-sm text-white/90 mb-2">Fast Processing</h3>
              <p className="text-xs text-white/40">Most refunds processed in 60-90 days through CAPE. No upfront costs to your clients — the firm advances all filing fees.</p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10">
              <div className="text-2xl mb-3">🖥️</div>
              <h3 className="font-semibold text-sm text-white/90 mb-2">Partner Portal</h3>
              <p className="text-xs text-white/40">Full dashboard with referral tracking, claim status updates, commission reports, and training resources. Everything in one place.</p>
            </div>
          </div>
        </div>
      </div>

      {/* The Opportunity */}
      <div className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-3" style={{ color: "#c4a050" }}>The Opportunity</h2>
          <p className="text-sm text-white/40 text-center mb-10">IEEPA tariff refunds represent the largest customs recovery event in US history.</p>
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-red-400 text-lg mt-0.5">🔴</span>
              <div>
                <h3 className="font-semibold text-sm mb-1">$22 million in interest accrues daily</h3>
                <p className="text-xs text-white/40">Every day your clients wait, they lose money. The sooner they file, the more they recover.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-yellow-400 text-lg mt-0.5">⏳</span>
              <div>
                <h3 className="font-semibold text-sm mb-1">180-day protest deadline on older entries</h3>
                <p className="text-xs text-white/40">Entries from before 2023 may require protest filings with strict deadlines. Time-sensitive action is needed.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <span className="text-green-400 text-lg mt-0.5">📊</span>
              <div>
                <h3 className="font-semibold text-sm mb-1">330,000 eligible importers — 83% haven&apos;t filed</h3>
                <p className="text-xs text-white/40">The vast majority of eligible importers haven&apos;t started the recovery process. Your clients are likely among them.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-10" style={{ color: "#c4a050" }}>Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-sm text-white/90 mb-2">How is it legal to pay referral commissions?</h3>
              <p className="text-xs text-white/50">Our legal partner is based in Arizona, where state law permits attorneys to pay referral fees to non-lawyers under specific conditions. Every commission payment is structured to comply with Arizona Rules of Professional Conduct.</p>
            </div>
            <div className="border-t border-white/5 pt-6">
              <h3 className="font-semibold text-sm text-white/90 mb-2">What types of professionals can join?</h3>
              <p className="text-xs text-white/50">Licensed customs brokers, freight forwarders, trade compliance consultants, CPAs serving importers, and other professionals in the import/trade industry.</p>
            </div>
            <div className="border-t border-white/5 pt-6">
              <h3 className="font-semibold text-sm text-white/90 mb-2">How much can I earn?</h3>
              <p className="text-xs text-white/50">Commission rates depend on your partnership tier. Rates are based on a percentage of the recovery fee. Higher volume partners earn higher rates. Details are provided during onboarding.</p>
            </div>
            <div className="border-t border-white/5 pt-6">
              <h3 className="font-semibold text-sm text-white/90 mb-2">Will you contact my clients directly?</h3>
              <p className="text-xs text-white/50">No. We never reach out to your clients unless they come through your referral link. You control the relationship.</p>
            </div>
            <div className="border-t border-white/5 pt-6">
              <h3 className="font-semibold text-sm text-white/90 mb-2">Is there a cost to join?</h3>
              <p className="text-xs text-white/50">No. The partner program is free. There are no fees, no minimums, and no obligations. You earn when your clients recover money.</p>
            </div>
            <div className="border-t border-white/5 pt-6">
              <h3 className="font-semibold text-sm text-white/90 mb-2">How do my clients file?</h3>
              <p className="text-xs text-white/50">Your clients don&apos;t need to do anything complicated. They submit basic information through your referral link, and our legal team handles the entire CAPE filing process.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-white/5 bg-[#c4a050]/[0.03]">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="font-display text-2xl mb-4" style={{ color: "#c4a050" }}>Ready to Start Earning?</h2>
          <p className="text-sm text-white/50 mb-6">Join the Fintella partner network and turn your client relationships into a new revenue stream.</p>
          <ScrollToTopCTA label="Apply Now — It's Free" />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-white/30">
          <p>© {new Date().getFullYear()} Fintella — Financial Intelligence Network. All rights reserved.</p>
          <p className="mt-2">Commission structures and eligibility vary. This page is for informational purposes and does not constitute a legal guarantee of earnings.</p>
          <div className="mt-3 flex justify-center gap-4">
            <Link href="/privacy" className="hover:text-white/50 transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white/50 transition">Terms</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
