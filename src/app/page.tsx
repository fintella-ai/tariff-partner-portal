import type { Metadata } from "next";
import Link from "next/link";
import ApplyFlow from "@/components/landing/ApplyFlow";
import "./landing.css";

export const metadata: Metadata = {
  title: "Fintella Partner Program — Earn 20% on Every Tariff Refund You Refer",
  description:
    "Refer clients to the top tariff-refund recovery firms in the country. Earn 20% direct commission plus downline overrides, with full real-time tracking, transparent payouts, and deep legal support.",
  openGraph: {
    title: "Fintella Partner Program — Earn 20% on Every Tariff Refund You Refer",
    description:
      "Refer clients to the top tariff-refund recovery firms in the country. Earn 20% direct commission plus downline overrides, with full real-time tracking and transparent payouts.",
    url: "https://fintella.partners",
    siteName: "Fintella",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fintella Partner Program — Earn 20% on Every Tariff Refund You Refer",
    description:
      "Refer clients. Earn 20% + downline overrides. Full transparency. Backed by top law firms.",
  },
  alternates: {
    canonical: "https://fintella.partners",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Fintella — Financial Intelligence Network",
  alternateName: "Fintella Partners",
  url: "https://fintella.partners",
  description:
    "Tariff refund recovery and cross-tax-credit partner network. Refer clients, earn 20% direct commission plus downline overrides, with real-time tracking and transparent payouts.",
  sameAs: ["https://trln.partners"],
  potentialAction: {
    "@type": "ApplyAction",
    target: "https://fintella.partners/apply",
    name: "Apply to become a referral partner",
  },
};

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "How much do I earn per referral?",
    a: "20% of the firm fee on every client you refer, paid as soon as the firm collects. Top partners earn more as they build a downline — see the commission math section above.",
  },
  {
    q: "Do I have to be a lawyer, CPA, or broker?",
    a: "No. If you have access to businesses that import goods, pay significant tariffs, have W-2 employees (ERC), run R&D-eligible operations, or have litigation exposure, you have a network we can monetize together.",
  },
  {
    q: "When do I get paid?",
    a: "Commissions flow through a transparent three-phase ledger: pending when the deal closes, due when the firm receives the client payment, paid when we cut your payout. You see every status change in real time in the portal.",
  },
  {
    q: "What's the catch? Is there a fee to join?",
    a: "No fee, no minimums, no lockup. You apply, we qualify you on a short call, and if we're a fit we send you an activation link to sign your partnership agreement digitally. That's it.",
  },
  {
    q: "Can I refer the same client for multiple services?",
    a: "Yes — that's the whole point of the stacked-credit model. Tariff refund + ERC credit + R&D credit + litigation recovery can all apply to the same client, and you earn on every engagement that closes.",
  },
  {
    q: "How do I track my deals and commissions?",
    a: "Every partner gets a secure portal login with passkey + 2FA support. You see every referred deal, its current stage, the expected commission, and exactly when you'll be paid. Full reporting, downline visibility, payout history, and deal-level notes.",
  },
  {
    q: "Is my data and my clients' data secure?",
    a: "Yes. The portal is encrypted in transit and at rest, deployed on hardened infrastructure, with role-based access controls, passkey authentication, and audit logging on every sensitive action. We take security seriously because our law firm partners require it.",
  },
  {
    q: "How does the downline work?",
    a: "You can invite other qualified partners under you. When they close a deal, you earn an override on top of their commission — without capping their earnings or ours. The math is open and auditable inside the portal.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-root min-h-screen text-[var(--app-text)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      <LandingNav />

      {/* HERO */}
      <section className="landing-hero relative overflow-hidden">
        <div className="landing-hero-glow" aria-hidden="true" />
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center relative">
          <div className="space-y-6 fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--brand-gold)]/15 border border-[var(--brand-gold)]/30 text-[var(--brand-gold)] text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[var(--brand-gold)] animate-pulse" />
              Now accepting referral partners
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05]">
              Refer tariff-refund clients.
              <br />
              <span className="landing-gradient-text">Earn 20% on every deal.</span>
            </h1>
            <p className="text-lg text-[var(--app-text-muted)] max-w-xl">
              Fintella connects business networks to the top tariff-refund recovery firms in the country. You refer. We recover. You earn — on direct deals, your downline's deals, <strong>and</strong> stacked cross-product opportunities like ERC, R&amp;D credits, and litigation recovery.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <a href="#apply" className="btn-gold text-base">
                Apply in 60 Seconds →
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-[var(--app-border)] text-sm font-semibold hover:border-[var(--brand-gold)] transition"
              >
                See how it works
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-[var(--app-text-muted)]">
              <TrustBadge label="Backed by top tax law firms" />
              <TrustBadge label="Real-time deal tracking" />
              <TrustBadge label="Transparent 3-phase payouts" />
            </div>
          </div>

          <div id="apply" className="landing-apply-card scroll-mt-24">
            <ApplyFlow />
          </div>
        </div>
      </section>

      {/* TRUST BAND */}
      <section className="border-y border-[var(--app-border)] bg-[var(--app-bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-[var(--app-text-muted)]">
          <span className="uppercase tracking-widest text-xs">In partnership with</span>
          <span className="font-display font-semibold text-[var(--app-text)]">Frost Law</span>
          <span className="text-[var(--app-text-faint)]">·</span>
          <span className="font-display font-semibold text-[var(--app-text)]">Furdock &amp; Foglia Law LLP</span>
          <span className="text-[var(--app-text-faint)]">·</span>
          <span className="font-display font-semibold text-[var(--app-text)]">ERC Tax Law</span>
        </div>
      </section>

      {/* OPPORTUNITY */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-14">
          <SectionHeader
            eyebrow="The Opportunity"
            title="$80B+ in recoverable tariff refunds. Your network is sitting on a slice of it."
            body="Under the Supreme Court's IEEPA decision, countless U.S. importers are entitled to refunds on tariffs they've already paid. Most don't know. The ones who do need a law firm that actually does the work. That's where you come in — and why every referral you send is worth serious commission."
          />
          <div className="grid md:grid-cols-3 gap-5">
            <StatCard headline="20%" sub="Direct commission on every referred deal" />
            <StatCard headline="+5–10%" sub="Override on every deal your downline closes" />
            <StatCard headline="$0" sub="Cost to join. No fees, no minimums, no lockup." />
          </div>
        </div>
      </section>

      {/* CROSS-PRODUCT STACKING */}
      <section className="py-20 lg:py-24 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
          <SectionHeader
            eyebrow="Stack commissions across products"
            title="One client. Multiple refund opportunities. Every engagement earns."
            body="Most business clients don't qualify for just one refund — they qualify for several. Our law firm network runs them all, and you earn on each one that closes for the same client."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ProductTile icon="🚢" title="Tariff Refunds" body="IEEPA-eligible import duty recovery. Our flagship practice area." />
            <ProductTile icon="👥" title="ERC Credits" body="Employee Retention Credit refunds for clients with W-2 employees through 2021." />
            <ProductTile icon="🔬" title="R&amp;D Credits" body="Federal + state research credits for innovation-driven companies." />
            <ProductTile icon="⚖️" title="Litigation Recovery" body="Commercial disputes, collections, and recovery matters co-counseled by top-tier firms." />
          </div>
          <p className="text-center text-sm text-[var(--app-text-muted)] max-w-3xl mx-auto">
            Refer the client once. Our team routes them through every qualified engagement. You get paid on each recovery — tracked separately, transparently, inside your partner portal.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
          <SectionHeader
            eyebrow="How it works"
            title="From application to first commission in under two weeks."
            body="No drawn-out onboarding. No PowerPoint training modules. Apply, qualify, refer — and start earning."
          />
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard
              num="01"
              title="Apply"
              body="Tell us about your network in 60 seconds. We'll send you a short qualification call to confirm it's a fit."
            />
            <StepCard
              num="02"
              title="Activate"
              body="Approved partners get an activation link, sign the partnership agreement digitally via SignWell, and receive their unique referral code within minutes."
            />
            <StepCard
              num="03"
              title="Refer &amp; Earn"
              body="Share your referral link or submit clients directly. Track every deal, every commission, and every payout in real time from your portal."
            />
          </div>
        </div>
      </section>

      {/* DOWNLINE */}
      <section className="py-20 lg:py-24 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid lg:grid-cols-2 gap-14 items-center">
          <div className="space-y-5">
            <div className="text-xs uppercase tracking-widest text-[var(--brand-gold)] font-semibold">
              Your downline works for you
            </div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold">
              Build a network. Earn overrides on every deal they close.
            </h2>
            <p className="text-[var(--app-text-muted)]">
              Every partner you recruit earns their own commission — and you earn an override on top. You're not taking a cut of their deal; you're getting paid a separate commission layer for bringing them into the network. No caps, no limits, no surprises.
            </p>
            <ul className="space-y-3 text-sm">
              <Check>You earn 20% on your direct deals.</Check>
              <Check>You earn 5–10% override on every downline deal that closes.</Check>
              <Check>Full downline visibility — see every partner, every deal, every commission inside your portal.</Check>
              <Check>No cap on recruitment depth. Your downline can build their own downline.</Check>
            </ul>
          </div>
          <CommissionTree />
        </div>
      </section>

      {/* TRANSPARENCY */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-14">
          <SectionHeader
            eyebrow="Total transparency"
            title="Every deal. Every commission. Every payout. In real time."
            body="No Excel spreadsheets. No 'trust us'. Your partner portal shows every referred client, every deal stage, every commission calculation, and every payout — the moment the firm updates it."
          />
          <div className="grid md:grid-cols-3 gap-5">
            <FeatureTile
              icon="📊"
              title="Live deal tracking"
              body="Every referred client flows through a visible pipeline. See stage changes the moment they happen — new lead, engaged, closed-won, paid — all timestamped."
            />
            <FeatureTile
              icon="💰"
              title="3-phase commission ledger"
              body="Pending when the deal closes. Due when the firm collects the client payment. Paid when the money hits your account. Each status flip is auditable."
            />
            <FeatureTile
              icon="🧾"
              title="Batched payouts"
              body="Commissions are batched, approved, and processed through the portal — with a full history of every batch, every entry, and the exact calculation behind each number."
            />
            <FeatureTile
              icon="🌳"
              title="Downline visibility"
              body="See every partner below you, their deals, their commissions, and your override on each one. Zero hidden math."
            />
            <FeatureTile
              icon="🔔"
              title="Real-time notifications"
              body="Get notified the moment a referral converts, a deal changes stage, or a payout is ready. Email, SMS, and in-portal bell."
            />
            <FeatureTile
              icon="📱"
              title="Mobile-first portal"
              body="Installable PWA. Works on iPhone, Android, desktop. Refer and track from anywhere."
            />
          </div>
        </div>
      </section>

      {/* SUPPORT + TRUST */}
      <section className="py-20 lg:py-24 bg-[var(--app-bg-secondary)] border-y border-[var(--app-border)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-12">
          <SectionHeader
            eyebrow="Serious support. Serious credibility."
            title="Backed by top-tier tax law firms. Armed with a partner portal built for the long haul."
            body="This isn't a pop-up affiliate program. It's a production-grade partner infrastructure built on the same legal muscle that already recovers millions for clients."
          />
          <div className="grid md:grid-cols-3 gap-5">
            <CredibilityCard
              title="Frost Law"
              body="Nationally recognized tax controversy and tariff refund firm. Fintella's primary recovery partner for IEEPA tariff refund claims."
            />
            <CredibilityCard
              title="Furdock &amp; Foglia Law LLP"
              body="Co-counsel firm with massive track record in refund recovery and collections. Partnered with ERC Tax Law to deliver cross-product results for shared clients."
            />
            <CredibilityCard
              title="ERC Tax Law"
              body="ERC refund specialists inside the partner network. Your tariff client may also be an ERC client — and every recovery earns separately."
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            <SupportTile icon="💬" title="Live partner support chat" />
            <SupportTile icon="🔐" title="Passkey + 2FA login security" />
            <SupportTile icon="📞" title="Bridged click-to-call from portal" />
            <SupportTile icon="📚" title="Training library + weekly live call" />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 space-y-10">
          <SectionHeader
            eyebrow="Before you ask"
            title="Frequently asked questions"
          />
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 lg:py-24 bg-[var(--app-bg-secondary)] border-t border-[var(--app-border)]">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 text-center space-y-8">
          <h2 className="font-display text-3xl lg:text-5xl font-bold">
            Your network is worth more than you think.
          </h2>
          <p className="text-lg text-[var(--app-text-muted)] max-w-2xl mx-auto">
            Apply in 60 seconds. We'll schedule a short qualification call, and if it's a fit you can be activated and earning within days.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#apply" className="btn-gold text-base">
              Apply Now →
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
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational subcomponents — kept in-file to avoid 15 tiny exports.
// ─────────────────────────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-[var(--app-bg)]/80 border-b border-[var(--app-border)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-lg">
          <span className="text-[var(--brand-gold)]">Fintella</span>
          <span className="hidden sm:inline text-[var(--app-text-muted)] font-normal text-sm">
            · Partner Program
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <a
            href="#apply"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--app-text)] hover:text-[var(--brand-gold)] transition"
          >
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
      <div className="text-xs uppercase tracking-widest text-[var(--brand-gold)] font-semibold">
        {eyebrow}
      </div>
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
      <div className="text-5xl font-display font-bold text-[var(--brand-gold)]/30 absolute -top-2 right-3 pointer-events-none">
        {num}
      </div>
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
        {/* connectors */}
        <line x1="200" y1="80" x2="110" y2="180" stroke="url(#gold)" strokeWidth="2" opacity="0.5" />
        <line x1="200" y1="80" x2="290" y2="180" stroke="url(#gold)" strokeWidth="2" opacity="0.5" />
        <line x1="110" y1="200" x2="60" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />
        <line x1="110" y1="200" x2="160" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />
        <line x1="290" y1="200" x2="240" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />
        <line x1="290" y1="200" x2="340" y2="300" stroke="url(#gold)" strokeWidth="2" opacity="0.35" />

        {/* you */}
        <g>
          <circle cx="200" cy="60" r="32" fill="url(#gold)" />
          <text x="200" y="58" textAnchor="middle" fontSize="11" fontWeight="700" fill="#080d1c">YOU</text>
          <text x="200" y="72" textAnchor="middle" fontSize="10" fontWeight="600" fill="#080d1c">20%</text>
        </g>
        {/* L2 partners */}
        <g>
          <circle cx="110" cy="200" r="26" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="2" />
          <text x="110" y="196" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--app-text)">L2</text>
          <text x="110" y="208" textAnchor="middle" fontSize="9" fill="var(--app-text-muted)">15%</text>
          <circle cx="290" cy="200" r="26" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="2" />
          <text x="290" y="196" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--app-text)">L2</text>
          <text x="290" y="208" textAnchor="middle" fontSize="9" fill="var(--app-text-muted)">15%</text>
        </g>
        {/* L3 partners */}
        <g>
          <circle cx="60" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
          <circle cx="160" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
          <circle cx="240" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
          <circle cx="340" cy="310" r="18" fill="var(--app-card-bg)" stroke="url(#gold)" strokeWidth="1.5" opacity="0.75" />
        </g>
        {/* override callouts */}
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
      <div className="mt-3 text-sm text-[var(--app-text-muted)] leading-relaxed">{a}</div>
    </details>
  );
}
