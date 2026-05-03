import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SetVariantCookie } from "./SetVariantCookie";
import BrokerSignupForm from "./BrokerSignupForm";
import HeroCalculator from "./HeroCalculator";

export const metadata: Metadata = {
  title: "The Only Tariff Refund Widget for CargoWise & Magaya | Fintella",
  description:
    "Embed our IEEPA refund calculator inside your TMS. Refer clients in one click. Earn 10-20% commission. Free to join. 5-minute setup.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "TMS Widget — Turn Every Shipment Into Revenue | Fintella",
    description:
      "The only tariff refund tool that runs inside your shipping software. Earn 10-20% on every recovery.",
    type: "website",
  },
};

/* ── Shared data ────────────────────────────────────────────────────── */

const STEPS = [
  {
    num: "01",
    title: "Run the Calculator",
    body: "Enter your client’s import data or drop a CF 7501. Our engine cross-references live IEEPA rates, stacked tariffs, and 180-day deadlines to produce an instant refund estimate.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="6" x2="16" y2="6" />
        <line x1="8" y1="10" x2="10" y2="10" />
        <line x1="14" y1="10" x2="16" y2="10" />
        <line x1="8" y1="14" x2="10" y2="14" />
        <line x1="14" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="10" y2="18" />
        <line x1="14" y1="18" x2="16" y2="18" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Share the PDF",
    body: "Download or email a branded refund report to your client. It shows exactly how much they can recover, the filing deadline, and why legal counsel matters.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Earn Commission",
    body: "When the client signs, the legal team handles everything. You earn commission on every successful recovery. Direct deposit, no overhead.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
];

const FAQ_ITEMS = [
  {
    q: "How much can I earn?",
    a: "You earn a percentage of the legal fee on every successful IEEPA recovery you refer. With average recoveries of $50K-$500K+ per importer and firm fees around 25%, a single referral can net you $1,250 to $31,000+. Refer 20 importers and you’re looking at $200K+ in annual commission income.",
  },
  {
    q: "Is there any cost to me or my clients?",
    a: "Zero. Joining the partner program is free. Your clients pay nothing upfront — the entire engagement is contingency-based. The firm only gets paid if they recover money. Compare that to hiring a CIT litigation attorney reactively at $800-$1,650/hour.",
  },
  {
    q: "Do my clients stay mine?",
    a: "Absolutely. You maintain your existing client relationship. Fintella’s legal partner handles only the IEEPA recovery — they don’t poach your brokerage business. Your clients are your clients. Period.",
  },
  {
    q: "Can’t my clients just file through CAPE themselves?",
    a: "CAPE is a submission tool, not a legal strategy. It doesn’t reconcile cross-broker data, isolate IEEPA from stacked tariffs, monitor 180-day deadlines per entry, or defend against CBP audits. 15% of declarations have been rejected. Once accepted, CAPE filings cannot be amended — one error and the entry is gone.",
  },
  {
    q: "What about entries excluded from CAPE?",
    a: "CAPE Phase 1 excludes finally liquidated entries — roughly 37% of all eligible entries. The only path to recovery for those is filing suit at the U.S. Court of International Trade. Only licensed attorneys can represent businesses in CIT. That’s precisely what Fintella’s legal partner handles.",
  },
  {
    q: "How are referral commissions legal?",
    a: "In August 2020, the Arizona Supreme Court (Administrative Order 2020-180) unanimously eliminated Ethics Rule 5.4, making Arizona the first U.S. state to allow lawyers to pay referral fees to non-attorneys. There is no cap on the percentage. Commissions are reported as 1099-NEC income.",
  },
  {
    q: "What if a client’s claim is denied?",
    a: "That’s exactly why legal counsel matters. If CBP denies or reduces a claim, the firm files suit at the U.S. Court of International Trade at no additional cost under the contingency arrangement. Over 1,000 importers have already filed CIT cases.",
  },
  {
    q: "How does AI Document Intake work?",
    a: "Drop a CF 7501 or entry summary into our system and get a full refund estimate in about 30 seconds. Our AI extracts HTS codes, country of origin, entered values, and duty amounts — then cross-references live IEEPA rates and filing deadlines. No manual data entry required.",
  },
  {
    q: "What is the TMS widget?",
    a: "A tool that embeds directly inside CargoWise, Magaya, or any browser-based TMS. You generate an API key, follow 6 setup steps, and it’s live. No IT tickets. You can submit referrals, run the calculator, and track commissions without leaving your shipping software.",
  },
];

/* ── Page ────────────────────────────────────────────────────────────── */

export default function BrokersLandingPage() {
  const cookieStore = cookies();
  const existingVariant = cookieStore.get("broker_variant")?.value;
  const variant =
    existingVariant && ["A", "B", "C"].includes(existingVariant)
      ? existingVariant
      : ["A", "B", "C"][Math.floor(Math.random() * 3)];
  const RATES: Record<string, number> = { A: 10, B: 15, C: 20 };
  const splitRate = RATES[variant] || 15;

  return (
    <main
      className="min-h-screen overflow-hidden font-body"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      <SetVariantCookie variant={variant} />

      {/* ── Section 1: Nav ──────────────────────────────────────────── */}
      <nav
        className="relative z-10"
        style={{ borderBottom: "1px solid var(--app-border-subtle)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-xl"
            style={{ color: "var(--brand-gold)" }}
          >
            Fintella
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm transition"
              style={{ color: "var(--app-text-faint)" }}
            >
              Partner Login
            </Link>
            <a
              href="#signup-form"
              className="text-sm font-semibold px-5 py-2 rounded-full transition hover:scale-105 active:scale-95"
              style={{
                background: "var(--brand-gold)",
                color: "var(--app-button-gold-text)",
              }}
            >
              Become a Partner
            </a>
          </div>
        </div>
      </nav>

      {/* ── Section 2: Hero ─────────────────────────────────────────── */}
      <section className="relative">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-10"
            style={{
              background:
                "radial-gradient(circle, var(--brand-gold) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-60 -left-40 w-[500px] h-[500px] rounded-full opacity-5"
            style={{
              background:
                "radial-gradient(circle, var(--brand-gold) 0%, transparent 70%)",
            }}
          />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div
              className="inline-block rounded-full px-5 py-2 text-xs font-bold tracking-widest uppercase mb-8"
              style={{
                background: "var(--app-gold-overlay)",
                color: "var(--app-gold-text)",
                border: "1px solid var(--app-gold-overlay-border)",
              }}
            >
              INDUSTRY FIRST &mdash; NO COMPETITOR HAS THIS
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-7xl leading-[1.05] mb-8 tracking-tight">
              The Only Tariff Refund Tool
              <br />
              That Runs{" "}
              <span style={{ color: "var(--brand-gold)" }}>
                Inside Your TMS
              </span>
            </h1>

            <p
              className="text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
              style={{ color: "var(--app-text-muted)" }}
            >
              Embed our widget in CargoWise or Magaya. Spot refund-eligible
              clients. Refer in one click. Earn{" "}
              <strong style={{ color: "var(--brand-gold)" }}>
                {splitRate}%
              </strong>{" "}
              on every recovery.
            </p>

            {/* Live calculator — the product IS the demo */}
            <HeroCalculator splitRate={splitRate} />

            {/* Works with row */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
              {["CargoWise", "Magaya", "Any Browser-Based TMS"].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                  style={{
                    background: "var(--app-gold-overlay-subtle)",
                    border: "1px solid var(--app-gold-overlay-border-subtle)",
                    color: "var(--app-text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--brand-gold)" }}>&#10003;</span>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              {
                value: "$166B",
                label: "IEEPA Duties Collected",
                sub: "Since April 2025",
              },
              {
                value: "83%",
                label: "Importers Haven’t Filed",
                sub: "303K+ unfiled",
              },
              {
                value: "80",
                label: "Days Average Deadline",
                sub: "Entries expiring now",
              },
              {
                value: "5 min",
                label: "Widget Setup",
                sub: "Self-service install",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="text-center p-4 rounded-xl"
                style={{
                  background: "var(--app-gold-overlay-subtle)",
                  border: "1px solid var(--app-gold-overlay-border-subtle)",
                }}
              >
                <div
                  className="font-display text-3xl font-bold mb-1"
                  style={{ color: "var(--app-gold-text)" }}
                >
                  {s.value}
                </div>
                <div
                  className="text-xs uppercase tracking-wider mb-0.5"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  {s.label}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--app-text-faint)", opacity: 0.6 }}
                >
                  {s.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: Why Your Clients Need Legal Counsel ──────────── */}
      <section
        className="py-20"
        style={{ background: "var(--app-bg-secondary)" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <div
              className="inline-block rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase mb-6"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              Reality Check
            </div>
            <h2 className="font-display text-3xl sm:text-4xl mb-4">
              Why Your Clients Need{" "}
              <span style={{ color: "#f87171" }}>Legal Counsel</span>
            </h2>
            <p
              className="text-lg max-w-3xl mx-auto"
              style={{ color: "var(--app-text-muted)" }}
            >
              CAPE is a filing tool, not a legal strategy. 15% of declarations
              rejected. No amendments. 180-day deadlines expiring now. Here are
              the risks your clients face.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                num: "01",
                title: "CAPE Doesn’t Protect Them",
                bullets: [
                  "15% of declarations rejected",
                  "No amendments once accepted",
                  "No audit defense, no offset protection",
                ],
              },
              {
                num: "02",
                title: "180-Day Deadlines Expiring Now",
                bullets: [
                  "Under 19 U.S.C. § 1514, each entry has its own protest clock",
                  "Miss it = permanently barred",
                  "Entries from early 2025 hitting this cliff today",
                ],
              },
              {
                num: "03",
                title: "37% of Entries Need Litigation",
                bullets: [
                  "Excluded from CAPE Phase 1",
                  "Only CIT attorneys can represent businesses",
                  "CIT rates: $800–$1,650/hr if hired reactively",
                ],
              },
              {
                num: "04",
                title: "You Refer. They Handle Everything.",
                bullets: [
                  "Zero liability — law firm is counsel of record",
                  "Attorney-client privilege protects your client",
                  "Contingency-based — $0 upfront",
                  `You earn ${splitRate}% on every recovery`,
                ],
              },
            ].map((card) => (
              <div
                key={card.num}
                className="p-6 rounded-xl"
                style={{
                  background:
                    card.num === "04"
                      ? "var(--app-gold-overlay-subtle)"
                      : "rgba(239, 68, 68, 0.04)",
                  border:
                    card.num === "04"
                      ? "1px solid var(--app-gold-overlay-border-subtle)"
                      : "1px solid rgba(239, 68, 68, 0.12)",
                }}
              >
                <div
                  className="font-mono text-[11px] font-bold mb-2"
                  style={{
                    color: card.num === "04" ? "var(--brand-gold)" : "#f87171",
                  }}
                >
                  {card.num}
                </div>
                <h3 className="font-display text-lg font-semibold mb-3">
                  {card.title}
                </h3>
                <ul className="space-y-2">
                  {card.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <span
                        className="shrink-0 mt-1"
                        style={{
                          color:
                            card.num === "04"
                              ? "var(--brand-gold)"
                              : "#f87171",
                          fontSize: "12px",
                        }}
                      >
                        {card.num === "04" ? "✓" : "•"}
                      </span>
                      <span
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: Inline Signup Form ───────────────────────────── */}
      <section className="py-20">
        <div className="max-w-2xl mx-auto px-6">
          <BrokerSignupForm variant={variant} rate={splitRate} />
        </div>
      </section>

      {/* ── Section 5: Refer. Don't File. ───────────────────────────── */}
      <section
        className="py-20"
        style={{ background: "var(--app-bg-secondary)" }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2
              className="font-display text-3xl sm:text-4xl mb-4"
              style={{ color: "var(--brand-gold)" }}
            >
              Refer. Don&apos;t File. Earn More. Risk Nothing.
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: "var(--app-text-muted)" }}
            >
              You could handle IEEPA recoveries yourself. Or you could hand it
              to a top-tier firm, earn a bigger payout, and carry zero liability.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* DIY column */}
            <div
              className="p-8 rounded-2xl"
              style={{
                background: "rgba(239, 68, 68, 0.04)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
              }}
            >
              <div
                className="text-xs font-bold tracking-widest uppercase mb-4"
                style={{ color: "#f87171" }}
              >
                If You Handle It Yourself
              </div>
              <div className="space-y-4">
                {[
                  "You’re the declarant of record — you own every error",
                  "No attorney-client privilege on client disclosures",
                  "Can’t represent clients in CIT if claims are denied",
                  "No defense against government offset netting",
                  "You monitor deadlines across hundreds of entries",
                  "One CAPE mistake = no amendment, no second filing",
                  "$10K/violation broker penalties + license risk",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-3">
                    <span className="text-red-400 shrink-0 mt-0.5">
                      &#10005;
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Refer column */}
            <div
              className="p-8 rounded-2xl"
              style={{
                background: "var(--app-gold-overlay)",
                border: "1px solid var(--app-gold-overlay-border)",
              }}
            >
              <div
                className="text-xs font-bold tracking-widest uppercase mb-4"
                style={{ color: "var(--app-gold-text)" }}
              >
                If You Refer Through Fintella
              </div>
              <div className="space-y-4">
                {[
                  "Zero liability — the law firm is counsel of record",
                  "Full attorney-client privilege protects your clients",
                  "CIT litigation handled if claims are denied",
                  "Active defense against government offset attempts",
                  "Legal team monitors every deadline across every entry",
                  "19-point compliance audit before anything goes to CBP",
                  `You earn ${splitRate}% of the firm fee on every recovery`,
                ].map((line) => (
                  <div key={line} className="flex items-start gap-3">
                    <span
                      className="shrink-0 mt-0.5"
                      style={{ color: "var(--brand-gold)" }}
                    >
                      &#10003;
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "var(--app-text-secondary)" }}
                    >
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 6: What's Your Book Worth? ──────────────────────── */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2
              className="font-display text-3xl sm:text-4xl mb-4"
              style={{ color: "var(--brand-gold)" }}
            >
              What&apos;s Your Book Worth?
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: "var(--app-text-muted)" }}
            >
              Every importer paying IEEPA duties is a potential recovery.
              Here&apos;s what the math looks like with just 20 clients.
            </p>
          </div>

          {/* Calculation breakdown */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              border: "1px solid var(--app-gold-overlay-border)",
            }}
          >
            <div
              className="grid grid-cols-1 sm:grid-cols-4 gap-px"
              style={{ background: "var(--app-border-subtle)" }}
            >
              {[
                {
                  label: "Your Importers",
                  value: "20",
                  note: "Paying IEEPA duties",
                },
                {
                  label: "Avg Refund Each",
                  value: "$50K",
                  note: "Conservative estimate",
                },
                {
                  label: "Firm Fee",
                  value: "~25%",
                  note: "Of recovered amount",
                },
                {
                  label: "Your Commission",
                  value: `${splitRate}%`,
                  note: "Of firm fee",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="p-6 text-center"
                  style={{ background: "var(--app-bg)" }}
                >
                  <div
                    className="text-xs uppercase tracking-wider mb-2"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    {item.label}
                  </div>
                  <div
                    className="font-display text-3xl sm:text-4xl font-bold mb-1"
                    style={{ color: "var(--app-gold-text)" }}
                  >
                    {item.value}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    {item.note}
                  </div>
                </div>
              ))}
            </div>

            {/* Result */}
            <div
              className="p-8 text-center"
              style={{
                background: "var(--app-gold-overlay)",
                borderTop: "1px solid var(--app-gold-overlay-border)",
              }}
            >
              <div
                className="text-sm uppercase tracking-widest mb-2"
                style={{ color: "var(--app-text-muted)" }}
              >
                20 importers &times; $50K refund &times; 25% fee &times;{" "}
                {splitRate}% commission
              </div>
              <div
                className="font-display text-5xl sm:text-6xl font-bold mb-2"
                style={{ color: "var(--brand-gold)" }}
              >
                $
                {(
                  20 *
                  50000 *
                  0.25 *
                  (splitRate / 100)
                ).toLocaleString()}
              </div>
              <div style={{ color: "var(--app-text-muted)" }}>
                per year in commission income &mdash;{" "}
                <strong>at the {splitRate}% tier</strong>
              </div>
              <div
                className="mt-4 text-sm"
                style={{ color: "var(--app-text-faint)" }}
              >
                At the 25% tier, that&apos;s{" "}
                <strong style={{ color: "var(--app-gold-text)" }}>
                  $62,500/year
                </strong>
                . With 50 importers:{" "}
                <strong style={{ color: "var(--app-gold-text)" }}>
                  $156,250/year
                </strong>
                .
              </div>
            </div>
          </div>

          <div className="text-center mt-8">
            <p
              className="text-sm mb-6"
              style={{ color: "var(--app-text-faint)" }}
            >
              Zero overhead. Zero legal work. Zero liability. Just referrals.
            </p>
            <Link
              href="/calculator"
              className="inline-block text-base font-bold px-10 py-4 rounded-full transition-transform hover:scale-105 active:scale-95"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand-gold) 0%, #f0d070 100%)",
                color: "var(--app-button-gold-text)",
              }}
            >
              Calculate Your Revenue
            </Link>
          </div>
        </div>
      </section>

      {/* ── Section 7: Deep Legal — 6 Risk Cards + Firm Capabilities ── */}
      <section
        className="py-20"
        style={{ background: "var(--app-bg-secondary)" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <div
              className="inline-block rounded-full px-4 py-1.5 text-xs font-bold tracking-widest uppercase mb-6"
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              Deep Dive
            </div>
            <h2 className="font-display text-3xl sm:text-4xl mb-4">
              This Is Heading to{" "}
              <span style={{ color: "#f87171" }}>Litigation</span>. Your Clients
              Need Counsel.
            </h2>
            <p
              className="text-lg max-w-3xl mx-auto"
              style={{ color: "var(--app-text-muted)" }}
            >
              CAPE is a filing tool &mdash; not a legal strategy. 15% of
              declarations rejected. No amendments. 180-day deadlines expiring
              now. Finally liquidated entries require federal court.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                num: "01",
                title: "CAPE Doesn’t Protect Your Clients",
                body: "CBP’s portal lets importers upload entry numbers. It doesn’t reconcile cross-broker data, isolate IEEPA from stacked 301/232 tariffs, or defend against audits. One bad entry rejects the entire declaration. No amendments. No second chances.",
              },
              {
                num: "02",
                title: "180-Day Deadlines Are Expiring Now",
                body: "Under 19 U.S.C. § 1514, every entry has its own protest clock. Miss it and that refund is gone permanently. Entries from early 2025 are hitting this cliff today.",
              },
              {
                num: "03",
                title: "37% of Entries Require Federal Court",
                body: "CAPE Phase 1 excludes finally liquidated entries. Recovery for those requires filing at the U.S. Court of International Trade. Only licensed attorneys can represent businesses in CIT.",
              },
              {
                num: "04",
                title: "Filing Without Review Invites Scrutiny",
                body: "Many importers reclassified goods during the tariff period. Filing a refund claim flags those entries for CBP review, risking penalties up to 4x unpaid duties under 19 U.S.C. § 1592.",
              },
              {
                num: "05",
                title: "CIT Litigation Costs Are Staggering",
                body: "Hiring a CIT attorney reactively costs $800–$1,650/hour. The contingency model means $0 upfront and access to the same caliber of representation. Over 1,000 importers have already filed CIT cases.",
              },
              {
                num: "06",
                title: "Arizona Referral Law Protects You",
                body: "In August 2020, the Arizona Supreme Court (Administrative Order 2020-180) unanimously eliminated Ethics Rule 5.4, making Arizona the first U.S. state to allow lawyers to pay referral fees to non-attorneys. No cap on the percentage. 1099-NEC income.",
              },
            ].map((item) => (
              <div
                key={item.num}
                className="p-6 rounded-xl"
                style={{
                  background:
                    item.num === "06"
                      ? "var(--app-gold-overlay-subtle)"
                      : "rgba(239, 68, 68, 0.04)",
                  border:
                    item.num === "06"
                      ? "1px solid var(--app-gold-overlay-border-subtle)"
                      : "1px solid rgba(239, 68, 68, 0.12)",
                }}
              >
                <div
                  className="font-mono text-[11px] font-bold mb-2"
                  style={{
                    color:
                      item.num === "06" ? "var(--brand-gold)" : "#f87171",
                  }}
                >
                  {item.num}
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">
                  {item.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 7b: How It Works (3-step) ───────────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2
              className="font-display text-3xl sm:text-4xl mb-4"
              style={{ color: "var(--brand-gold)" }}
            >
              Three Steps to Revenue
            </h2>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: "var(--app-text-muted)" }}
            >
              You already know which clients pay IEEPA duties. Now you have the
              tool to monetize that knowledge.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((item) => (
              <div
                key={item.num}
                className="relative p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: "var(--app-gold-overlay-subtle)",
                  border: "1px solid var(--app-gold-overlay-border-subtle)",
                }}
              >
                <div
                  className="font-display text-6xl font-bold absolute top-4 right-6 opacity-5"
                  style={{ color: "var(--brand-gold)" }}
                >
                  {item.num}
                </div>
                <div className="mb-4" style={{ color: "var(--brand-gold)" }}>
                  {item.icon}
                </div>
                <h3 className="font-display text-xl font-semibold mb-3">
                  {item.title}
                </h3>
                <p style={{ color: "var(--app-text-muted)" }}>{item.body}</p>
              </div>
            ))}
          </div>

          {/* Calculator CTA */}
          <div className="text-center mt-12">
            <Link
              href="/calculator"
              className="inline-block text-base font-bold px-10 py-4 rounded-full transition-transform hover:scale-105 active:scale-95"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand-gold) 0%, #f0d070 100%)",
                color: "var(--app-button-gold-text)",
              }}
            >
              Try the Free Calculator Now
            </Link>
          </div>
        </div>
      </section>

      {/* ── Section 7c: AI Document Intake ──────────────────────────── */}
      <section
        className="py-20"
        style={{ background: "var(--app-bg-secondary)" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <div
            className="p-8 sm:p-12 rounded-2xl relative overflow-hidden"
            style={{
              background: "var(--app-gold-overlay)",
              border: "1px solid var(--app-gold-overlay-border)",
            }}
          >
            <div
              className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full opacity-20 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, var(--brand-gold) 0%, transparent 70%)",
                transform: "translate(30%, -30%)",
              }}
            />

            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8">
              <div
                className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center"
                style={{
                  background: "var(--app-gold-overlay)",
                  border: "1px solid var(--app-gold-overlay-border)",
                }}
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--brand-gold)" }}
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>

              <div className="flex-1 text-center lg:text-left">
                <div
                  className="inline-block rounded-full px-4 py-1 text-xs font-bold tracking-widest uppercase mb-4"
                  style={{
                    background: "var(--app-gold-overlay)",
                    color: "var(--app-gold-text)",
                    border: "1px solid var(--app-gold-overlay-border)",
                  }}
                >
                  AI-Powered
                </div>
                <h2
                  className="font-display text-2xl sm:text-3xl mb-3"
                  style={{ color: "var(--brand-gold)" }}
                >
                  Drop a CF 7501 &mdash; Get Results in 30 Seconds
                </h2>
                <p
                  className="text-sm sm:text-base leading-relaxed max-w-2xl"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Our AI document intake extracts HTS codes, country of origin,
                  entered values, and duty amounts from any CF 7501 or entry
                  summary. It cross-references live IEEPA rates and 180-day
                  filing deadlines to produce an instant, audit-ready refund
                  estimate. No manual data entry. No spreadsheets. Just drop the
                  document.
                </p>
              </div>

              <div className="shrink-0">
                <Link
                  href="/calculator"
                  className="inline-block text-sm font-bold px-8 py-3.5 rounded-full transition-transform hover:scale-105 active:scale-95 whitespace-nowrap"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--brand-gold) 0%, #f0d070 100%)",
                    color: "var(--app-button-gold-text)",
                  }}
                >
                  Try It Free
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 8: FAQ ──────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <h2
            className="font-display text-3xl sm:text-4xl mb-12 text-center"
            style={{ color: "var(--brand-gold)" }}
          >
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl overflow-hidden"
                style={{
                  background: "var(--app-gold-overlay-subtle)",
                  border: "1px solid var(--app-gold-overlay-border-subtle)",
                }}
              >
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer font-medium hover:opacity-80">
                  {item.q}
                  <span
                    className="group-open:rotate-45 transition-transform text-xl ml-4"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    +
                  </span>
                </summary>
                <div
                  className="px-6 pb-4 text-sm leading-relaxed"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 9: Final CTA ────────────────────────────────────── */}
      <section className="py-24 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-10"
            style={{
              background:
                "radial-gradient(ellipse, var(--brand-gold) 0%, transparent 70%)",
            }}
          />
        </div>

        <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
          <h2
            className="font-display text-4xl sm:text-5xl mb-6"
            style={{ color: "var(--brand-gold)" }}
          >
            Stop Leaving Money on the Table
          </h2>
          <p
            className="text-xl mb-10 max-w-xl mx-auto"
            style={{ color: "var(--app-text-muted)" }}
          >
            Your clients are paying duties that can be recovered. You already
            know which ones. Now you have the tools to act.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <a
              href="#signup-form"
              className="text-lg font-bold px-12 py-5 rounded-full transition-transform hover:scale-105 active:scale-95"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand-gold) 0%, #f0d070 100%)",
                color: "var(--app-button-gold-text)",
              }}
            >
              Become a Partner
            </a>
            <Link
              href="/calculator"
              className="text-lg font-medium px-12 py-5 rounded-full transition"
              style={{
                border: "1px solid var(--app-border)",
                color: "var(--app-text-secondary)",
              }}
            >
              Try the Calculator
            </Link>
          </div>

          <div
            className="text-xs mt-4"
            style={{ color: "var(--app-text-faint)", opacity: 0.6 }}
          >
            No fees. No obligations. Free to join. Calculator is free forever.
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer
        style={{ borderTop: "1px solid var(--app-border-subtle)" }}
        className="py-8"
      >
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div
            className="text-xs"
            style={{ color: "var(--app-text-faint)", opacity: 0.5 }}
          >
            &copy; 2026 Fintella &mdash; Financial Intelligence Network. All
            rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-xs transition hover:opacity-80"
              style={{ color: "var(--app-text-faint)", opacity: 0.5 }}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs transition hover:opacity-80"
              style={{ color: "var(--app-text-faint)", opacity: 0.5 }}
            >
              Terms
            </Link>
            <Link
              href="/login"
              className="text-xs transition hover:opacity-80"
              style={{ color: "var(--app-text-faint)", opacity: 0.5 }}
            >
              Partner Login
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
