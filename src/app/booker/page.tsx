import type { Metadata } from "next";
import Link from "next/link";
import StandaloneBooker from "@/components/landing/StandaloneBooker";

/**
 * /booker?applicationId=X — destination for external landing pages
 * (Systeme.io / Framer / ClickFunnels / anything) to redirect applicants
 * to after /api/apply returns success.
 *
 * The external landing POSTs to https://fintella.partners/api/apply,
 * gets { applicationId }, then redirects to
 * https://fintella.partners/booker?applicationId=<id>.
 */
export const metadata: Metadata = {
  title: "Book your qualification call — Fintella Partners",
  description: "Pick a time for your partner qualification call.",
  robots: { index: false, follow: false },
};

export default function BookerPage({
  searchParams,
}: {
  searchParams: { applicationId?: string };
}) {
  const applicationId = searchParams.applicationId ?? null;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] flex flex-col">
      <nav className="border-b border-[var(--app-border)]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-display font-bold text-lg">
            <span className="text-[var(--brand-gold)]">Fintella</span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-[var(--app-text-muted)] hover:text-[var(--brand-gold)]"
          >
            Partner Login →
          </Link>
        </div>
      </nav>

      <section className="flex-1 py-12">
        <div className="max-w-2xl mx-auto px-6">
          <div className="card p-6 sm:p-8">
            <StandaloneBooker applicationId={applicationId} />
          </div>
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-[var(--app-text-muted)] border-t border-[var(--app-border)]">
        © {new Date().getFullYear()} Fintella — Financial Intelligence Network
      </footer>
    </main>
  );
}
