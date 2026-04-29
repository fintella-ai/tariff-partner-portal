import type { Metadata } from "next";
import Link from "next/link";
import WebinarPlayer from "@/components/landing/WebinarPlayer";

export const metadata: Metadata = {
  title: "Webinar: IEEPA Tariff Recovery Partner Opportunity | Fintella",
  robots: { index: false, follow: false },
};

export default function WebinarWatchPage({
  searchParams,
}: {
  searchParams: { name?: string };
}) {
  const firstName = searchParams.name || "there";

  return (
    <main className="min-h-screen bg-[#060a14] text-white">
      {/* Nav */}
      <nav className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-xl" style={{ color: "#c4a050" }}>Fintella</Link>
          <Link href="/partners/brokers" className="text-sm text-[#c4a050] hover:underline transition">Apply to Partner →</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 pt-10 pb-16">
        {/* Welcome */}
        <div className="text-center mb-8">
          <div className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase bg-green-500/10 text-green-400 border border-green-500/20 mb-4">
            You&apos;re In — Webinar Starting Now
          </div>
          <h1 className="font-display text-2xl sm:text-3xl mb-2" style={{ color: "#c4a050" }}>
            Welcome, {firstName}!
          </h1>
          <p className="text-sm text-white/50">Watch the full presentation below. A partner application link appears at the end.</p>
        </div>

        {/* Video player */}
        <WebinarPlayer />

        {/* Key takeaways */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="text-2xl mb-2">💰</div>
            <h3 className="font-semibold text-sm mb-1">Legal Referral Commissions</h3>
            <p className="text-xs text-white/40">Arizona-licensed counsel pays you directly on every successful recovery.</p>
          </div>
          <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="text-2xl mb-2">⚡</div>
            <h3 className="font-semibold text-sm mb-1">Fast-Cash Buyout</h3>
            <p className="text-xs text-white/40">Clients can get 65–85 cents on the dollar in weeks. You earn on the buyout amount.</p>
          </div>
          <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="text-2xl mb-2">🔒</div>
            <h3 className="font-semibold text-sm mb-1">Clients Stay Yours</h3>
            <p className="text-xs text-white/40">We never contact your clients directly. You remain their trusted advisor.</p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center p-8 rounded-2xl bg-[#c4a050]/[0.05] border border-[#c4a050]/20">
          <h2 className="font-display text-xl mb-3" style={{ color: "#c4a050" }}>Ready to Start Earning?</h2>
          <p className="text-sm text-white/50 mb-5">Apply to the Fintella partner program. Free to join, no obligations.</p>
          <a
            href="/partners/brokers"
            className="inline-block px-8 py-3.5 rounded-xl font-semibold text-sm text-black"
            style={{ background: "#c4a050" }}
          >
            Apply Now — It&apos;s Free
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-white/30">
          <p>© {new Date().getFullYear()} Fintella — Financial Intelligence Network. All rights reserved.</p>
        </div>
      </div>
    </main>
  );
}
