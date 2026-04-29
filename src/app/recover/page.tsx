import type { Metadata } from "next";
import Link from "next/link";
import RecoverForm from "@/components/landing/RecoverForm";
import GatedResources from "@/components/landing/GatedResources";
import { getRecoverContent } from "@/lib/getLandingContent";

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

export const dynamic = "force-dynamic";

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: { ref?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string };
}) {
  const partnerCode = searchParams.ref || searchParams.utm_content || null;
  const sp = searchParams as Record<string, string | undefined>;
  const utmParams = {
    utm_source: sp.utm_source || null,
    utm_medium: sp.utm_medium || null,
    utm_campaign: sp.utm_campaign || null,
    utm_content: sp.utm_content || null,
    utm_term: sp.utm_term || null,
    utm_adgroup: sp.utm_adgroup || null,
  };
  const c = await getRecoverContent();

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
          <div>
            <div className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase bg-red-500/10 text-red-400 border border-red-500/20 mb-6">
              {c.hero.badge}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6" style={{ color: "#c4a050" }}>
              {c.hero.headline}
            </h1>
            <p className="text-lg text-white/70 mb-8 leading-relaxed" dangerouslySetInnerHTML={{ __html: c.hero.subheadline.replace(/\$166 billion/g, '<strong class="text-white">$166 billion</strong>').replace(/83% haven't filed yet\./g, '<strong class="text-white">83% haven\'t filed yet.</strong>') }} />
            <div className="space-y-4 text-white/60 text-sm">
              {c.hero.bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4 mt-10">
              {c.hero.stats.map((s, i) => (
                <div key={i} className="text-center">
                  <div className="font-display text-2xl font-bold" style={{ color: "#c4a050" }}>{s.value}</div>
                  <div className="text-xs text-white/40 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <RecoverForm partnerCode={partnerCode} utmParams={utmParams} />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-10" style={{ color: "#c4a050" }}>{c.howItWorks.title}</h2>
          <div className={`grid grid-cols-1 sm:grid-cols-${c.howItWorks.steps.length} gap-8`}>
            {c.howItWorks.steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#c4a050]/10 text-[#c4a050] flex items-center justify-center mx-auto mb-4 text-xl font-bold">{i + 1}</div>
                <h3 className="font-semibold text-sm mb-2">{s.title}</h3>
                <p className="text-xs text-white/50">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <GatedResources partnerCode={partnerCode} />

      {/* Footer */}
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-xs text-white/30">
          <p>{c.footer.copyright}</p>
          <p className="mt-2">{c.footer.disclaimer}</p>
          <div className="mt-3 flex justify-center gap-4">
            <Link href="/privacy" className="hover:text-white/50 transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white/50 transition">Terms</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
