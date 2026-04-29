import Link from "next/link";
import PartnerInterestForm from "@/components/landing/PartnerInterestForm";
import ScrollToTopCTA from "@/components/landing/ScrollToTopCTA";
import type { PartnersPageContent } from "@/lib/landingPageSchemas";

export default function PartnersPageRenderer({ c }: { c: PartnersPageContent }) {
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
          <div>
            <div className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase bg-green-500/10 text-green-400 border border-green-500/20 mb-6">
              {c.hero.badge}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6" style={{ color: "#c4a050" }}>
              {c.hero.headline}
            </h1>
            <p className="text-lg text-white/70 mb-8 leading-relaxed">{c.hero.subheadline}</p>

            <div className="space-y-4 text-white/60 text-sm">
              {c.hero.bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-green-400 mt-0.5 text-base">{b.icon}</span>
                  <span><strong className="text-white">{b.title}</strong> — {b.description}</span>
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
            <PartnerInterestForm />
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

      {/* Why Partner */}
      <div className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-3" style={{ color: "#c4a050" }}>{c.whyPartner.title}</h2>
          <p className="text-sm text-white/40 text-center mb-10">{c.whyPartner.subtitle}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {c.whyPartner.features.map((f, i) => (
              <div key={i} className="p-6 rounded-2xl border border-white/10">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-sm text-white/90 mb-2">{f.title}</h3>
                <p className="text-xs text-white/40">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The Opportunity */}
      <div className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-3" style={{ color: "#c4a050" }}>{c.opportunity.title}</h2>
          <p className="text-sm text-white/40 text-center mb-10">{c.opportunity.subtitle}</p>
          <div className="max-w-3xl mx-auto space-y-6">
            {c.opportunity.urgencyItems.map((u, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-lg mt-0.5">{u.icon}</span>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{u.title}</h3>
                  <p className="text-xs text-white/40">{u.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl text-center mb-10" style={{ color: "#c4a050" }}>{c.faq.title}</h2>
          <div className="space-y-6">
            {c.faq.items.map((f, i) => (
              <div key={i} className={i > 0 ? "border-t border-white/5 pt-6" : ""}>
                <h3 className="font-semibold text-sm text-white/90 mb-2">{f.question}</h3>
                <p className="text-xs text-white/50">{f.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-white/5 bg-[#c4a050]/[0.03]">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="font-display text-2xl mb-4" style={{ color: "#c4a050" }}>{c.bottomCta.title}</h2>
          <p className="text-sm text-white/50 mb-6">{c.bottomCta.subtitle}</p>
          <ScrollToTopCTA label={c.bottomCta.buttonText} />
        </div>
      </div>

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
