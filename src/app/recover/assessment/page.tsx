import type { Metadata } from "next";
import Link from "next/link";
import RecoverForm from "@/components/landing/RecoverForm";

export const metadata: Metadata = {
  title: "Free Tariff Recovery Assessment for US Importers",
  description: "Our specialists review your import history and estimate your IEEPA tariff refund. No obligation.",
  robots: { index: true, follow: true },
};

export default function AssessmentRecoverPage({
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
            <div className="inline-block rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-6">
              Complimentary Assessment
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6" style={{ color: "#c4a050" }}>
              Free Tariff Recovery Assessment
            </h1>
            <p className="text-lg text-white/70 mb-8 leading-relaxed">
              Our trade specialists review your import history and estimate your potential IEEPA tariff refund. <strong className="text-white">No cost, no obligation.</strong>
            </p>
            <div className="space-y-3 text-white/60 text-sm mb-8">
              <div className="flex items-center gap-3"><span className="text-blue-400">✓</span> Personalized review by trade specialists</div>
              <div className="flex items-center gap-3"><span className="text-blue-400">✓</span> Detailed refund estimate within 24 hours</div>
              <div className="flex items-center gap-3"><span className="text-blue-400">✓</span> Full-service filing if you qualify</div>
              <div className="flex items-center gap-3"><span className="text-blue-400">✓</span> Contingency-based — you only pay if we recover</div>
            </div>
          </div>
          <RecoverForm partnerCode={partnerCode} utmParams={utmParams} />
        </div>
      </div>
    </main>
  );
}
