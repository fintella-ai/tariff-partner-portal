export interface RecoverPageContent {
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    bullets: string[];
    stats: { value: string; label: string }[];
  };
  howItWorks: {
    title: string;
    steps: { title: string; description: string }[];
  };
  resources: {
    title: string;
    subtitle: string;
    items: { icon: string; title: string; description: string; file: string }[];
  };
  footer: { copyright: string; disclaimer: string };
}

export interface PartnersPageContent {
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    bullets: { icon: string; title: string; description: string }[];
    stats: { value: string; label: string }[];
  };
  howItWorks: {
    title: string;
    steps: { title: string; description: string }[];
  };
  whyPartner: {
    title: string;
    subtitle: string;
    features: { icon: string; title: string; description: string }[];
  };
  opportunity: {
    title: string;
    subtitle: string;
    urgencyItems: { icon: string; title: string; description: string }[];
  };
  faq: {
    title: string;
    items: { question: string; answer: string }[];
  };
  bottomCta: { title: string; subtitle: string; buttonText: string };
  footer: { copyright: string; disclaimer: string };
}

export type BrokersPageContent = PartnersPageContent;

export const DEFAULT_RECOVER: RecoverPageContent = {
  hero: {
    badge: "$22 Million in Interest Accrues Daily",
    headline: "Find Out How Much You're Owed in Tariff Refunds",
    subheadline: "The Supreme Court ruled IEEPA tariffs unlawful. $166 billion in refunds are available to US importers. 83% haven't filed yet.",
    bullets: [
      "No upfront cost — the firm advances all filing fees",
      "No recovery, no fee — you only pay if you get money back",
      "60-90 day processing through CBP's CAPE portal",
      "Two co-counsel law firms handling your claim",
    ],
    stats: [
      { value: "$166B", label: "Refunds Owed" },
      { value: "330K", label: "Eligible Importers" },
      { value: "83%", label: "Haven't Filed" },
    ],
  },
  howItWorks: {
    title: "How It Works",
    steps: [
      { title: "Estimate Your Refund", description: "Enter your approximate annual tariff duties. We'll show you what you could recover." },
      { title: "Book a Free Call", description: "A specialist reviews your import history and confirms eligibility. No obligation." },
      { title: "Get Your Money Back", description: "Our legal team files through CAPE. You get your refund in 60-90 days. No upfront cost." },
    ],
  },
  resources: {
    title: "Free Resources",
    subtitle: "Download these guides to understand the IEEPA tariff recovery process.",
    items: [
      { icon: "📘", title: "CAPE System Guide", description: "Why you need legal counsel to navigate CBP's CAPE refund portal and avoid costly filing errors.", file: "/resources/cape-system-guide.pdf" },
      { icon: "📋", title: "Our Value in Your Journey", description: "How our legal team adds value at every stage of the tariff recovery process — from filing to refund.", file: "/resources/our-value-add.pdf" },
      { icon: "⚖️", title: "Why Legal Counsel Matters", description: "The risks of filing IEEPA recovery claims without legal representation and how to protect your refund.", file: "/resources/why-legal-counsel.pdf" },
    ],
  },
  footer: {
    copyright: "© 2026 Fintella — Financial Intelligence Network. All rights reserved.",
    disclaimer: "This is not legal advice. Recovery amounts are estimates. Actual refunds depend on your import history and claim eligibility.",
  },
};

export const DEFAULT_PARTNERS: PartnersPageContent = {
  hero: {
    badge: "Licensed Referral Commission Program",
    headline: "Your Clients Are Owed Tariff Refunds. You Should Get Paid for That.",
    subheadline: "$166 billion in IEEPA tariff refunds. 83% of eligible importers haven't filed. As a customs broker, you're the first call — and with Fintella, every referral earns you a commission.",
    bullets: [
      { icon: "💰", title: "Legal referral commissions", description: "Our Arizona-based legal partner is licensed to pay referral fees directly to you" },
      { icon: "🤝", title: "Your clients stay yours", description: "We handle the legal filing behind the scenes. No poaching, no competition" },
      { icon: "🚀", title: "Zero cost to join", description: "No fees, no inventory, no risk. You refer, we recover, you earn" },
      { icon: "📊", title: "Real-time partner portal", description: "Track every referral, claim status, and commission payment 24/7" },
    ],
    stats: [
      { value: "$166B", label: "Refunds Available" },
      { value: "60–90", label: "Day Processing" },
      { value: "$0", label: "Cost to Join" },
    ],
  },
  howItWorks: {
    title: "How It Works",
    steps: [
      { title: "Apply to Join", description: "Fill out the form above. We review your application and set up your partner account within 24 hours." },
      { title: "Refer Your Clients", description: "Use your personalized referral link or submit clients directly through your partner portal." },
      { title: "We Handle Recovery", description: "Our legal team files through CBP's CAPE portal. Your client gets their refund in 60-90 days." },
      { title: "You Get Paid", description: "Earn a commission on every successful recovery. Paid directly — legally and compliantly." },
    ],
  },
  whyPartner: {
    title: "Why Brokers Choose Fintella",
    subtitle: "We built this program specifically for customs brokers and trade professionals.",
    features: [
      { icon: "⚖️", title: "Legally Compliant Commissions", description: "Arizona law permits our legal partner to pay referral fees to licensed professionals. Every payment is structured, documented, and above-board." },
      { icon: "🔒", title: "Client Relationship Protected", description: "We never contact your clients directly or try to disintermediate the broker relationship. You remain their trusted advisor." },
      { icon: "📈", title: "New Revenue Stream", description: "Turn your existing client base into a new profit center. No additional overhead — just refer clients you already serve." },
      { icon: "🏛️", title: "Two Co-Counsel Law Firms", description: "Your clients' claims are handled by experienced legal teams who specialize in tariff recovery through CBP's CAPE system." },
      { icon: "⚡", title: "Fast Processing", description: "Most refunds processed in 60-90 days through CAPE. No upfront costs to your clients — the firm advances all filing fees." },
      { icon: "🖥️", title: "Partner Portal", description: "Full dashboard with referral tracking, claim status updates, commission reports, and training resources. Everything in one place." },
    ],
  },
  opportunity: {
    title: "The Opportunity",
    subtitle: "IEEPA tariff refunds represent the largest customs recovery event in US history.",
    urgencyItems: [
      { icon: "🔴", title: "$22 million in interest accrues daily", description: "Every day your clients wait, they lose money. The sooner they file, the more they recover." },
      { icon: "⏳", title: "180-day protest deadline on older entries", description: "Entries from before 2023 may require protest filings with strict deadlines. Time-sensitive action is needed." },
      { icon: "📊", title: "330,000 eligible importers — 83% haven't filed", description: "The vast majority of eligible importers haven't started the recovery process. Your clients are likely among them." },
    ],
  },
  faq: {
    title: "Frequently Asked Questions",
    items: [
      { question: "How is it legal to pay referral commissions?", answer: "Our legal partner is based in Arizona, where state law permits attorneys to pay referral fees to non-lawyers under specific conditions. Every commission payment is structured to comply with Arizona Rules of Professional Conduct." },
      { question: "What types of professionals can join?", answer: "Licensed customs brokers, freight forwarders, trade compliance consultants, CPAs serving importers, and other professionals in the import/trade industry." },
      { question: "How much can I earn?", answer: "Commission rates depend on your partnership tier. Rates are based on a percentage of the recovery fee. Higher volume partners earn higher rates. Details are provided during onboarding." },
      { question: "Will you contact my clients directly?", answer: "No. We never reach out to your clients unless they come through your referral link. You control the relationship." },
      { question: "Is there a cost to join?", answer: "No. The partner program is free. There are no fees, no minimums, and no obligations. You earn when your clients recover money." },
      { question: "How do my clients file?", answer: "Your clients don't need to do anything complicated. They submit basic information through your referral link, and our legal team handles the entire CAPE filing process." },
    ],
  },
  bottomCta: {
    title: "Ready to Start Earning?",
    subtitle: "Join the Fintella partner network and turn your client relationships into a new revenue stream.",
    buttonText: "Apply Now — It's Free",
  },
  footer: {
    copyright: "© 2026 Fintella — Financial Intelligence Network. All rights reserved.",
    disclaimer: "Commission structures and eligibility vary. This page is for informational purposes and does not constitute a legal guarantee of earnings.",
  },
};

export const DEFAULT_BROKERS: BrokersPageContent = {
  ...DEFAULT_PARTNERS,
  hero: {
    ...DEFAULT_PARTNERS.hero,
    badge: "Built for Licensed Customs Brokers",
    headline: "Your Importer Clients Are Owed Millions. Earn Commissions for Every Recovery.",
    subheadline: "As a licensed customs broker, you're already the trusted advisor for importers navigating tariffs. Now you can earn legal referral commissions on every IEEPA recovery — without lifting a finger on the legal side.",
  },
  whyPartner: {
    ...DEFAULT_PARTNERS.whyPartner,
    title: "Built for Customs Brokers",
    subtitle: "We understand the broker-client relationship. That's why we built Fintella to protect it.",
    features: [
      { icon: "⚖️", title: "Arizona-Licensed Referral Fees", description: "Our Arizona-based legal partner is authorized to pay referral commissions to licensed customs brokers. Fully compliant with state bar rules." },
      { icon: "🔒", title: "Your ACE Data Stays Yours", description: "We never access your clients' ACE accounts or customs data. You share only what you choose, and the legal team works from there." },
      { icon: "📈", title: "Revenue Per Entry", description: "Every entry your client filed under IEEPA tariffs is a potential recovery. More entries = more refund = more commission for you." },
      { icon: "🤝", title: "White-Glove Client Experience", description: "Your clients get a premium legal service experience. They'll thank you for the referral, not question it." },
      { icon: "📊", title: "Port-Level Insights", description: "Track which of your clients' ports and HTS categories have the highest recovery potential." },
      { icon: "🏢", title: "Firm-to-Firm Referral", description: "This is a business-to-business relationship. You refer, the legal team recovers, and you earn a documented commission." },
    ],
  },
};

export function parsePageContent<T>(json: string, defaults: T): T {
  try {
    const parsed = JSON.parse(json || "{}");
    return deepMerge(defaults, parsed) as T;
  } catch {
    return defaults;
  }
}

function deepMerge<T>(base: T, overlay: any): T {
  if (overlay === null || overlay === undefined) return base;
  if (Array.isArray(base)) return (Array.isArray(overlay) ? overlay : base) as T;
  if (typeof base === "object" && base !== null) {
    const result: any = { ...base };
    for (const key of Object.keys(overlay)) {
      const baseVal = (base as any)[key];
      const overVal = overlay[key];
      result[key] = typeof baseVal === "object" && baseVal !== null && !Array.isArray(baseVal)
        ? deepMerge(baseVal, overVal)
        : overVal;
    }
    return result;
  }
  return overlay !== undefined ? overlay : base;
}
