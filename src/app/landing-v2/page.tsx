import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ApplyFlow from "@/components/landing/ApplyFlow";
import CommissionCalculator from "@/components/landing/CommissionCalculator";
import StickyCTA from "@/components/landing/StickyCTA";
import ExitIntentModal from "@/components/landing/ExitIntentModal";
import LandingPixels from "@/components/landing/LandingPixels";
import {
  DEFAULT_LANDING_CONTENT,
  parseLandingContent,
  type LandingContentData,
} from "@/lib/landingContent";
import "../landing.css";

export const dynamic = "force-dynamic";

async function loadLanding(): Promise<{
  content: LandingContentData;
  enabled: boolean;
  live: boolean;
}> {
  const row = await prisma.landingContent.findUnique({ where: { id: "global" } });
  if (!row) {
    return {
      content: DEFAULT_LANDING_CONTENT,
      enabled: false,
      live: false,
    };
  }
  return {
    content: parseLandingContent(row.published),
    enabled: row.landingV2Enabled,
    live: row.landingV2Live,
  };
}

async function loadLiveFaq(categories: string[]) {
  if (!categories.length) return [];
  return prisma.fAQ.findMany({
    where: { published: true, category: { in: categories } },
    orderBy: { sortOrder: "asc" },
    select: { question: true, answer: true, category: true },
  });
}

async function loadResources(ids: string[]) {
  if (!ids.length) return [];
  return prisma.trainingResource.findMany({
    where: { id: { in: ids }, published: true },
    select: { id: true, title: true, description: true, fileType: true, fileSize: true },
  });
}

async function loadActivePartnerCount(): Promise<number> {
  return prisma.partner.count({ where: { status: "active" } });
}

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await loadLanding();
  return {
    title: content.seo.title || DEFAULT_LANDING_CONTENT.seo.title,
    description: content.seo.description || DEFAULT_LANDING_CONTENT.seo.description,
    alternates: {
      canonical: content.seo.canonicalUrl || "https://fintella.partners",
    },
    openGraph: {
      title: content.seo.title,
      description: content.seo.description,
      url: content.seo.canonicalUrl,
      siteName: "Fintella",
      type: "website",
      images: content.seo.ogImageUrl ? [{ url: content.seo.ogImageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: content.seo.title,
      description: content.seo.description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function LandingV2Page({
  searchParams,
}: {
  searchParams: { utm_source?: string; utm_campaign?: string };
}) {
  const { content, enabled } = await loadLanding();

  if (!enabled) {
    redirect("/login");
  }

  const [liveFaqs, activePartners, selectedResources] = await Promise.all([
    content.faq.useLiveData ? loadLiveFaq(content.faq.categories) : Promise.resolve([]),
    loadActivePartnerCount(),
    loadResources(content.resources.items.map((i) => i.trainingResourceId).filter(Boolean)),
  ]);

  // UTM-aware hero — simple source-based tweak
  const utmSource = searchParams.utm_source?.toLowerCase() ?? "";
  const personalizedHero = utmSourcePersonalization(content.hero, utmSource);

  const structured = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Fintella — Financial Intelligence Network",
    url: "https://fintella.partners",
    description: content.seo.description,
    potentialAction: {
      "@type": "ApplyAction",
      target: "https://fintella.partners/landing-v2#apply",
      name: "Apply to Fintella partner program",
    },
  };

  const faqStructured =
    content.faq.useLiveData && liveFaqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: liveFaqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  return (
    <main className="landing-root min-h-screen text-[var(--app-text)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }} />
      {faqStructured && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructured) }} />
      )}

      <LandingPixels
        gtmContainerId={content.pixels.gtmContainerId}
        metaPixelId={content.pixels.metaPixelId}
        googleAdsId={content.pixels.googleAdsId}
        linkedInPartnerId={content.pixels.linkedInPartnerId}
      />

      <LandingNav />

      {/* HERO */}
      <section className="landing-hero relative overflow-hidden">
        <div className="landing-hero-glow" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center relative">
          <div className="space-y-6 fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--brand-gold)]/15 border border-[var(--brand-gold)]/30 text-[var(--brand-gold)] text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[var(--brand-gold)] animate-pulse" />
              {personalizedHero.eyebrow}
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05]">
              {personalizedHero.headlineTop}
              <br />
              <span className="landing-gradient-text">{personalizedHero.headlineAccent}</span>
            </h1>
            <p className="text-lg text-[var(--app-text-muted)] max-w-xl">
              {personalizedHero.subheadline}
            </p>
            {content.hero.videoUrl && (
              <div className="aspect-video w-full rounded-xl overflow-hidden border border-[var(--app-border)] bg-black">
                <iframe
                  src={embeddableVideoUrl(content.hero.videoUrl)}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Partner program intro"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-4 pt-2">
              <a href="#apply" className="btn-gold text-base">
                {content.hero.primaryCta}
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-[var(--app-border)] text-sm font-semibold hover:border-[var(--brand-gold)] transition"
              >
                {content.hero.secondaryCta}
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-[var(--app-text-muted)]">
              {content.hero.trustBadges.map((b, i) => (
                <TrustBadge key={i} label={b} />
              ))}
            </div>
          </div>

          <div id="apply" className="landing-apply-card scroll-mt-24">
            <ApplyFlow />
          </div>
        </div>
      </section>

      {/* LAW FIRM TRUST STRIP */}
      <section className="border-y border-[var(--app-border)] bg-[var(--app-bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-[var(--app-text-muted)]">
          <span className="uppercase tracking-widest text-xs">{content.lawFirmStrip.prefix}</span>
          {content.lawFirmStrip.firms.map((f, i) => (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span className="text-[var(--app-text-faint)]">·</span>}
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer" className="font-display font-semibold text-[var(--app-text)] hover:text-[var(--brand-gold)]">
                  {f.name}
                </a>
              ) : (
                <span className="font-display font-semibold text-[var(--app-text)]">{f.name}</span>
              )}
            </span>
          ))}
        </div>
      </section>

      {/* OPPORTUNITY */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-14">
          <SectionHeader
            eyebrow={content.opportunity.eyebrow}
            title={content.opportunity.title}
            body={content.opportunity.body}
          />
          <div className="grid md:grid-cols-3 gap-5">
            {content.opportunity.stats.map((s, i) => {
              const headline = s.headline.replace("{{activePartners}}", `${activePartners}+`);
              return <StatCard key={i} headline={headline} sub={s.sub} />;
            })}
          </div>
        </div>
      </section>

      {/* COMMISSION CALCULATOR */}
      <section className="py-20 lg:py-24 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
        <div className="max-w-5xl mx-auto px-6 lg:px-10">
          <CommissionCalculator />
        </div>
      </section>

      {/* CROSS-PRODUCT */}
      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
          <SectionHeader
            eyebrow={content.crossProduct.eyebrow}
            title={content.crossProduct.title}
            body={content.crossProduct.body}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {content.crossProduct.products.map((p, i) => (
              <ProductTile key={i} icon={p.icon} title={p.title} body={p.body} />
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 lg:py-28 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
          <SectionHeader
            eyebrow={content.howItWorks.eyebrow}
            title={content.howItWorks.title}
            body={content.howItWorks.body}
          />
          <div className="grid md:grid-cols-3 gap-6">
            {content.howItWorks.steps.map((s, i) => (
              <StepCard key={i} num={s.num} title={s.title} body={s.body} />
            ))}
          </div>
        </div>
      </section>

      {/* DOWNLINE */}
      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid lg:grid-cols-2 gap-14 items-center">
          <div className="space-y-5">
            <div className="text-xs uppercase tracking-widest text-[var(--brand-gold)] font-semibold">
              {content.downline.eyebrow}
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold">
              {content.downline.title}
            </h2>
            <p className="text-[var(--app-text-muted)]">{content.downline.body}</p>
            <ul className="space-y-3 text-sm">
              {content.downline.bullets.map((b, i) => (
                <Check key={i}>{b}</Check>
              ))}
            </ul>
          </div>
          <CommissionTree />
        </div>
      </section>

      {/* TRANSPARENCY */}
      <section className="py-20 lg:py-28 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-14">
          <SectionHeader
            eyebrow={content.transparency.eyebrow}
            title={content.transparency.title}
            body={content.transparency.body}
          />
          <div className="grid md:grid-cols-3 gap-5">
            {content.transparency.features.map((f, i) => (
              <FeatureTile key={i} icon={f.icon} title={f.title} body={f.body} />
            ))}
          </div>
        </div>
      </section>

      {/* CREDIBILITY */}
      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
          <SectionHeader
            eyebrow={content.credibility.eyebrow}
            title={content.credibility.title}
            body={content.credibility.body}
          />
          <div className="grid md:grid-cols-3 gap-5">
            {content.credibility.firms.map((f, i) => (
              <CredibilityCard key={i} title={f.title} body={f.body} />
            ))}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            {content.credibility.supportTiles.map((t, i) => (
              <SupportTile key={i} icon={t.icon} title={t.title} />
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      {content.testimonials.items.length > 0 && (
        <section className="py-20 lg:py-24 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
          <div className="max-w-6xl mx-auto px-6 lg:px-10 space-y-10">
            <SectionHeader eyebrow={content.testimonials.eyebrow} title={content.testimonials.title} />
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {content.testimonials.items.map((t, i) => (
                <TestimonialCard key={i} {...t} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* RESOURCES */}
      {selectedResources.length > 0 && (
        <section className="py-20 lg:py-24">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
            <SectionHeader
              eyebrow={content.resources.eyebrow}
              title={content.resources.title}
              body={content.resources.body}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {selectedResources.map((r) => (
                <ResourceTile key={r.id} title={r.title} description={r.description} fileType={r.fileType} fileSize={r.fileSize} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="py-20 lg:py-28 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 space-y-10">
          <SectionHeader eyebrow={content.faq.eyebrow} title={content.faq.title} />
          <div className="space-y-3">
            {(content.faq.useLiveData ? liveFaqs : content.faq.manualItems.map((m) => ({ question: m.q, answer: m.a }))).map(
              (item, i) => (
                <FaqItem key={i} q={item.question} a={item.answer} />
              )
            )}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 lg:py-24">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 text-center space-y-8">
          <h2 className="font-display text-3xl lg:text-5xl font-bold">{content.finalCta.title}</h2>
          <p className="text-lg text-[var(--app-text-muted)] max-w-2xl mx-auto">{content.finalCta.body}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#apply" className="btn-gold text-base">
              {content.finalCta.primaryCta}
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-[var(--app-border)] text-sm font-semibold hover:border-[var(--brand-gold)] transition"
            >
              Partner login
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-10 text-center text-xs text-[var(--app-text-muted)] border-t border-[var(--app-border)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-3">
          <div>© {new Date().getFullYear()} Fintella — Financial Intelligence Network. All rights reserved.</div>
          <div className="space-x-4">
            <Link href="/privacy" className="hover:text-[var(--brand-gold)]">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--brand-gold)]">Terms</Link>
            <Link href="/login" className="hover:text-[var(--brand-gold)]">Partner Login</Link>
          </div>
        </div>
      </footer>

      <StickyCTA label={content.finalCta.primaryCta} />
      {content.exitIntent.enabled && (
        <ExitIntentModal
          title={content.exitIntent.title}
          body={content.exitIntent.body}
          cta={content.exitIntent.cta}
          leadMagnetResourceId={content.exitIntent.leadMagnetResourceId}
        />
      )}
    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utmSourcePersonalization(
  hero: LandingContentData["hero"],
  utmSource: string,
): LandingContentData["hero"] {
  // Lightweight source-based personalization — based on the research report's
  // Unbounce DTR pattern. Only changes the eyebrow + headlineAccent for
  // known sources; everything else comes from the content.
  const map: Record<string, { eyebrow?: string; headlineAccent?: string; subheadline?: string }> = {
    accountant: {
      eyebrow: "Built for CPAs and tax advisors",
      subheadline:
        "Every business client you serve is a potential tariff-refund recovery. Refer, monitor in real-time, earn 20% on each firm fee — with full downline override.",
    },
    attorney: {
      eyebrow: "Built for law firms and referral attorneys",
      subheadline:
        "Every commercial client in your book is a potential tariff-refund candidate. Refer, track the deal through the portal, earn 20% on every recovery — with full downline override on partners you bring in.",
    },
    broker: {
      eyebrow: "Built for customs brokers + trade consultants",
      subheadline:
        "Your clients already trust you on the tariff line. Refer them in, we recover the refund, you earn 20% plus downline overrides.",
    },
  };
  const match = map[utmSource];
  if (!match) return hero;
  return {
    ...hero,
    eyebrow: match.eyebrow ?? hero.eyebrow,
    headlineAccent: match.headlineAccent ?? hero.headlineAccent,
    subheadline: match.subheadline ?? hero.subheadline,
  };
}

function embeddableVideoUrl(url: string): string {
  // Normalize YouTube + Vimeo + Loom share URLs to embed format
  const yt = url.match(/youtube\.com\/watch\?v=([^&]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const ytShort = url.match(/youtu\.be\/([^?&]+)/);
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const loom = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return url;
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-[var(--app-bg)]/80 border-b border-[var(--app-border)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg">
          <span className="text-[var(--brand-gold)]">Fintella</span>
          <span className="hidden sm:inline text-[var(--app-text-muted)] font-normal text-sm">· Partner Program</span>
        </Link>
        <div className="flex items-center gap-2">
          <a href="#apply" className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--app-text)] hover:text-[var(--brand-gold)] transition">
            Apply
          </a>
          <Link
            href="/login"
            className="px-4 py-2 rounded-md border border-[var(--app-border)] text-sm font-semibold hover:border-[var(--brand-gold)] hover:text-[var(--brand-gold)] transition"
          >
            Log In
          </Link>
        </div>
      </div>
    </nav>
  );
}

function SectionHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="text-center space-y-4 max-w-3xl mx-auto">
      <div className="text-xs uppercase tracking-widest text-[var(--brand-gold)] font-semibold">{eyebrow}</div>
      <h2 className="font-display text-3xl lg:text-4xl font-bold leading-tight">{title}</h2>
      {body && <p className="text-[var(--app-text-muted)] text-lg">{body}</p>}
    </div>
  );
}

function TrustBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--brand-gold)]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

function StatCard({ headline, sub }: { headline: string; sub: string }) {
  return (
    <div className="landing-stat-card p-6 rounded-xl text-center">
      <div className="font-display text-5xl font-bold landing-gradient-text">{headline}</div>
      <div className="text-sm text-[var(--app-text-muted)] mt-2">{sub}</div>
    </div>
  );
}

function ProductTile({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card p-5 space-y-2 hover:border-[var(--brand-gold)] transition h-full">
      <div className="text-3xl">{icon}</div>
      <div className="font-display font-bold" dangerouslySetInnerHTML={{ __html: title }} />
      <div className="text-sm text-[var(--app-text-muted)]">{body}</div>
    </div>
  );
}

function StepCard({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="card p-6 space-y-3 relative overflow-hidden">
      <div className="text-5xl font-display font-bold text-[var(--brand-gold)]/30 absolute -top-2 right-3 pointer-events-none">{num}</div>
      <div className="font-display text-xl font-bold relative z-10">{title}</div>
      <div className="text-sm text-[var(--app-text-muted)] relative z-10" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}

function FeatureTile({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card p-5 space-y-2 h-full">
      <div className="text-2xl">{icon}</div>
      <div className="font-display font-bold">{title}</div>
      <div className="text-sm text-[var(--app-text-muted)]">{body}</div>
    </div>
  );
}

function SupportTile({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] flex items-center gap-3">
      <div className="text-xl">{icon}</div>
      <div className="text-sm font-semibold">{title}</div>
    </div>
  );
}

function CredibilityCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-6 space-y-3 h-full">
      <div className="font-display text-lg font-bold" dangerouslySetInnerHTML={{ __html: title }} />
      <div className="text-sm text-[var(--app-text-muted)]">{body}</div>
    </div>
  );
}

function TestimonialCard({ quote, authorName, authorRole, authorCompany }: { quote: string; authorName: string; authorRole: string; authorCompany: string }) {
  return (
    <div className="card p-6 space-y-4 h-full">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--brand-gold)] opacity-50">
        <path d="M10 11H6c-.5 0-1-.5-1-1V6c0-2 1-4 4-5 .5 0 1 .5 1 1s-.5 1-1 1c-1.5 0-2 1-2 3h3c.5 0 1 .5 1 1v4c0 .5-.5 1-1 1zm8 0h-4c-.5 0-1-.5-1-1V6c0-2 1-4 4-5 .5 0 1 .5 1 1s-.5 1-1 1c-1.5 0-2 1-2 3h3c.5 0 1 .5 1 1v4c0 .5-.5 1-1 1z" />
      </svg>
      <p className="text-sm leading-relaxed">{quote}</p>
      <div className="pt-2 border-t border-[var(--app-border)]">
        <div className="font-semibold text-sm">{authorName}</div>
        <div className="text-xs text-[var(--app-text-muted)]">{authorRole}{authorCompany ? ` · ${authorCompany}` : ""}</div>
      </div>
    </div>
  );
}

function ResourceTile({ title, description, fileType, fileSize }: { title: string; description: string | null; fileType: string; fileSize: string | null }) {
  return (
    <div className="card p-5 space-y-2 h-full">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--brand-gold)] font-semibold">
        📄 <span>{fileType}{fileSize ? ` · ${fileSize}` : ""}</span>
      </div>
      <div className="font-display font-bold">{title}</div>
      {description && <div className="text-sm text-[var(--app-text-muted)]">{description}</div>}
      <div className="pt-2 text-xs text-[var(--app-text-muted)] italic">
        Full access after you're approved as a partner.
      </div>
    </div>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-[var(--brand-gold)] flex-shrink-0 mt-0.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-[var(--app-text-muted)]">{children}</span>
    </li>
  );
}

function CommissionTree() {
  return (
    <div className="relative h-[360px] flex items-center justify-center">
      <svg viewBox="0 0 400 360" className="w-full h-full max-w-md">
        <defs>
          <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c4a050" />
            <stop offset="100%" stopColor="#e8c060" />
          </linearGradient>
        </defs>
        <line x1="200" y1="80" x2="110" y2="180" stroke="url(#gold)" strokeWidth="2" opacity="0.5" />
        <line x1="200" y1="80" x2="290" y2="180" stroke="url(#gold)" strokeWidth="2" opacity="0.5" />
        <line x1="110" y1="200" x2="60" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />
        <line x1="110" y1="200" x2="160" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />
        <line x1="290" y1="200" x2="240" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />
        <line x1="290" y1="200" x2="340" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />
        <g>
          <circle cx="200" cy="60" r="32" fill="url(#gold)" />
          <text x="200" y="58" textAnchor="middle" fontSize="11" fontWeight="700" fill="#080d1c">YOU</text>
          <text x="200" y="72" textAnchor="middle" fontSize="10" fontWeight="600" fill="#080d1c">20%</text>
        </g>
        <g>
          <circle cx="110" cy="200" r="26" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="2" />
          <text x="110" y="196" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--app-text)">L2</text>
          <text x="110" y="208" textAnchor="middle" fontSize="9" fill="var(--app-text-muted)">15%</text>
          <circle cx="290" cy="200" r="26" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="2" />
          <text x="290" y="196" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--app-text)">L2</text>
          <text x="290" y="208" textAnchor="middle" fontSize="9" fill="var(--app-text-muted)">15%</text>
        </g>
        <g>
          <circle cx="60" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
          <circle cx="160" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
          <circle cx="240" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
          <circle cx="340" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
        </g>
        <text x="30" y="160" fontSize="10" fill="var(--brand-gold)" fontWeight="600">+5% override</text>
        <text x="300" y="160" fontSize="10" fill="var(--brand-gold)" fontWeight="600">+5% override</text>
      </svg>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="card p-5 group">
      <summary className="flex items-center justify-between cursor-pointer list-none font-semibold">
        <span>{q}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--brand-gold)] transition-transform group-open:rotate-180">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-3 text-sm text-[var(--app-text-muted)] leading-relaxed whitespace-pre-wrap">{a}</div>
    </details>
  );
}
