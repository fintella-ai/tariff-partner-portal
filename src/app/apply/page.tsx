import type { Metadata } from "next";
import Link from "next/link";
import ApplyFlow from "@/components/landing/ApplyFlow";
import "../landing.css";

/**
 * /apply — the squeeze-page variant of the landing page.
 *
 * This is the ad-campaign destination: stripped of long-form marketing
 * sections, focused entirely on conversion. Send paid traffic here.
 * Organic / direct traffic lands on `/` (the full landing page).
 *
 * Intentionally minimal: logo, one-line pitch, form, trust strip, footer.
 * UTM params are auto-captured by ApplyFlow.
 */
export const metadata: Metadata = {
  title: "Apply Now — Fintella Referral Partner Program",
  description:
    "Earn 20% on every tariff refund client you refer. No fee to join. Apply in 60 seconds.",
  openGraph: {
    title: "Apply Now — Fintella Referral Partner Program",
    description: "Earn 20% on every tariff refund client you refer. No fee to join.",
    url: "https://fintella.partners/apply",
    siteName: "Fintella",
    type: "website",
  },
  alternates: { canonical: "https://fintella.partners/apply" },
  robots: { index: true, follow: true },
};

export default function ApplySqueezePage() {
  return (
    <main className="landing-root min-h-screen flex flex-col">
      <nav className="border-b border-[var(--app-border)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display font-bold text-lg">
            <span className="text-[var(--brand-gold)]">Fintella</span>
            <span className="hidden sm:inline text-[var(--app-text-muted)] font-normal text-sm ml-2">
              · Partner Program
            </span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-[var(--app-text-muted)] hover:text-[var(--brand-gold)]"
          >
            Partner Login →
          </Link>
        </div>
      </nav>

      <section className="flex-1 relative overflow-hidden">
        <div className="landing-hero-glow" aria-hidden="true" />
        <div className="max-w-3xl mx-auto px-6 py-12 lg:py-20 space-y-8 relative">
          <div className="text-center space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--brand-gold)]/15 border border-[var(--brand-gold)]/30 text-[var(--brand-gold)] text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[var(--brand-gold)] animate-pulse" />
              Applications open
            </div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.1]">
              Earn <span className="landing-gradient-text">20%</span> on every
              <br className="hidden sm:block" />
              tariff refund you refer.
            </h1>
            <p className="text-[var(--app-text-muted)] max-w-xl mx-auto">
              Fintella connects business networks to the top tariff-refund law firms in the country. Apply in 60 seconds — no fee to join, no minimums, full transparency on every commission.
            </p>
          </div>

          <div className="landing-apply-card">
            <ApplyFlow />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-[var(--app-text-muted)] pt-4">
            <span className="uppercase tracking-widest">In partnership with</span>
            <span className="font-display font-semibold text-[var(--app-text)]">Frost Law</span>
            <span className="text-[var(--app-text-faint)]">·</span>
            <span className="font-display font-semibold text-[var(--app-text)]">Furdock &amp; Foglia Law LLP</span>
            <span className="text-[var(--app-text-faint)]">·</span>
            <span className="font-display font-semibold text-[var(--app-text)]">ERC Tax Law</span>
          </div>
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-[var(--app-text-muted)] border-t border-[var(--app-border)]">
        <div className="max-w-5xl mx-auto px-6 space-x-4">
          <Link href="/" className="hover:text-[var(--brand-gold)]">Learn more</Link>
          <Link href="/privacy" className="hover:text-[var(--brand-gold)]">Privacy</Link>
          <Link href="/terms" className="hover:text-[var(--brand-gold)]">Terms</Link>
          <span>© {new Date().getFullYear()} Fintella</span>
        </div>
      </footer>
    </main>
  );
}
