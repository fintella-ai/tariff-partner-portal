/**
 * LandingContent schema — the shape of the JSON blob stored on
 * LandingContent.draft / .published. Both the admin editor + the
 * /landing-v2 renderer schema-validate at read time against this type.
 *
 * New sections: add the key here, the renderer ignores missing keys and
 * the editor tolerates them, so forward-compat is free.
 */

export interface LandingContentData {
  // HERO — above-the-fold
  hero: {
    eyebrow: string; // e.g. "Now accepting referral partners"
    headlineTop: string; // "Refer tariff-refund clients."
    headlineAccent: string; // "Earn 20% on every deal." (rendered in gold gradient)
    subheadline: string;
    primaryCta: string; // "Apply in 60 Seconds"
    secondaryCta: string; // "See how it works"
    videoUrl: string; // YouTube / Vimeo / Loom / MP4 URL; empty = no video
    videoPosterUrl: string; // poster image while video loads
    trustBadges: string[]; // small "✓ X" bullets under CTAs
  };

  // LAW FIRM STRIP — right under hero
  lawFirmStrip: {
    prefix: string; // "In partnership with"
    firms: { name: string; url?: string }[];
  };

  // OPPORTUNITY — stats + market framing
  opportunity: {
    eyebrow: string;
    title: string;
    body: string;
    stats: { headline: string; sub: string }[]; // 3 stat cards
  };

  // CROSS-PRODUCT STACKING — tabs or grid
  crossProduct: {
    eyebrow: string;
    title: string;
    body: string;
    products: { icon: string; title: string; body: string }[];
  };

  // HOW IT WORKS — steps
  howItWorks: {
    eyebrow: string;
    title: string;
    body: string;
    steps: { num: string; title: string; body: string }[];
  };

  // DOWNLINE — commission tree + bullets
  downline: {
    eyebrow: string;
    title: string;
    body: string;
    bullets: string[];
  };

  // TRANSPARENCY — feature tiles
  transparency: {
    eyebrow: string;
    title: string;
    body: string;
    features: { icon: string; title: string; body: string }[];
  };

  // CREDIBILITY + SUPPORT
  credibility: {
    eyebrow: string;
    title: string;
    body: string;
    firms: { title: string; body: string }[];
    supportTiles: { icon: string; title: string }[];
  };

  // TESTIMONIALS — slider
  testimonials: {
    eyebrow: string;
    title: string;
    items: {
      quote: string;
      authorName: string;
      authorRole: string;
      authorCompany: string;
    }[];
  };

  // RESOURCES — training PDFs offered as lead-magnet
  resources: {
    eyebrow: string;
    title: string;
    body: string;
    items: {
      trainingResourceId: string; // FK to TrainingResource.id
      displayTitle: string;
      displayDescription: string;
    }[];
  };

  // FAQ — pulled live from FAQ table by default, but can be overridden here
  faq: {
    eyebrow: string;
    title: string;
    useLiveData: boolean; // true = query FAQ model at request time
    categories: string[]; // which FAQ categories to include when useLiveData
    manualItems: { q: string; a: string }[]; // used when useLiveData=false
  };

  // FINAL CTA
  finalCta: {
    title: string;
    body: string;
    primaryCta: string;
  };

  // A/B TEST VARIANTS (headline only to start)
  abTest: {
    enabled: boolean;
    headlineVariants: { id: string; headlineTop: string; headlineAccent: string }[];
  };

  // CONVERSION PIXELS — admin pastes IDs, renderer injects scripts
  pixels: {
    metaPixelId: string; // Facebook
    googleAdsId: string; // AW-XXXX
    googleAdsConversionLabel: string; // for conversion event
    linkedInPartnerId: string;
    gtmContainerId: string; // GTM-XXXX (optional umbrella)
  };

  // SEO overrides
  seo: {
    title: string;
    description: string;
    ogImageUrl: string; // empty = default /api/og/landing
    canonicalUrl: string;
  };

  // EXIT-INTENT POPUP (optional)
  exitIntent: {
    enabled: boolean;
    title: string;
    body: string;
    cta: string;
    leadMagnetResourceId: string; // TrainingResource.id to gate behind email
  };

  // META
  _meta: {
    version: number; // bumped on every publish
    generatedAt: string | null; // ISO timestamp of last regenerate-from-portal run
  };

  // Section order for admin landing editor (optional — uses default if not set)
  sectionOrder?: string[];
}

export const DEFAULT_LANDING_CONTENT: LandingContentData = {
  hero: {
    eyebrow: "Now accepting referral partners",
    headlineTop: "Refer tariff-refund clients.",
    headlineAccent: "Earn 20% on every deal.",
    subheadline:
      "Fintella connects business networks to the top tariff-refund recovery firms in the country. Clients pay nothing until their refund arrives. You earn 20% on every closed engagement — plus overrides on your downline's deals and stacked cross-product opportunities (ERC, R&D credits, litigation recovery).",
    primaryCta: "Apply in 60 Seconds →",
    secondaryCta: "See how it works",
    videoUrl: "",
    videoPosterUrl: "",
    trustBadges: [
      "Backed by top tax law firms",
      "Real-time deal tracking",
      "Transparent 3-phase payouts",
    ],
  },
  lawFirmStrip: {
    prefix: "In partnership with",
    firms: [
      { name: "Frost Law" },
      { name: "Furdock & Foglia Law LLP" },
      { name: "ERC Tax Law" },
    ],
  },
  opportunity: {
    eyebrow: "The Opportunity",
    title: "$166B+ owed to U.S. importers. Every day, another $22M accrues in interest.",
    body: "Under the Supreme Court's IEEPA decision, an estimated 330,000+ U.S. importers are entitled to refunds on tariffs they've already paid — plus statutory interest. Most don't know the window exists. The ones who do need a law firm that actually files the claim, and they need to do it before the 180-day protest deadline from liquidation. That's where you come in — and why every qualified referral you send is worth serious commission.",
    stats: [
      { headline: "20%", sub: "Direct commission on every referred deal you close" },
      { headline: "+5–10%", sub: "Override on every deal your downline closes" },
      { headline: "$0", sub: "Cost to join. Contingency-fee model — clients pay nothing until their refund arrives." },
    ],
  },
  crossProduct: {
    eyebrow: "Stack commissions across products",
    title: "One client. Multiple refund opportunities. Every engagement earns.",
    body: "Most business clients don't qualify for just one refund — they qualify for several. Our law firm network runs them all, and you earn on each one that closes for the same client.",
    products: [
      { icon: "🚢", title: "Tariff Refunds", body: "IEEPA-eligible import duty recovery. Our flagship practice area." },
      { icon: "👥", title: "ERC Credits", body: "Employee Retention Credit refunds for clients with W-2 employees through 2021." },
      { icon: "🔬", title: "R&D Credits", body: "Federal + state research credits for innovation-driven companies." },
      { icon: "⚖️", title: "Litigation Recovery", body: "Commercial disputes, collections, and recovery matters co-counseled by top-tier firms." },
    ],
  },
  howItWorks: {
    eyebrow: "How it works",
    title: "From application to first commission in under two weeks.",
    body: "No drawn-out onboarding. No PowerPoint training modules. Apply, qualify, refer — and start earning.",
    steps: [
      { num: "01", title: "Apply", body: "Tell us about your network in 60 seconds. We'll send you a short qualification call to confirm it's a fit." },
      { num: "02", title: "Activate", body: "Approved partners get an activation link, sign the partnership agreement digitally via SignWell, and receive their unique referral code within minutes." },
      { num: "03", title: "Refer &amp; Earn", body: "Share your referral link or submit clients directly. Track every deal, every commission, and every payout in real time from your portal." },
    ],
  },
  downline: {
    eyebrow: "Your downline works for you",
    title: "Build a network. Earn overrides on every deal they close.",
    body: "Every partner you recruit earns their own commission — and you earn an override on top. You're not taking a cut of their deal; you're getting paid a separate commission layer for bringing them into the network. No caps, no limits, no surprises.",
    bullets: [
      "You earn 20% on your direct deals.",
      "You earn 5–10% override on every downline deal that closes.",
      "Full downline visibility — see every partner, every deal, every commission inside your portal.",
      "No cap on recruitment depth. Your downline can build their own downline.",
    ],
  },
  transparency: {
    eyebrow: "Total transparency",
    title: "Every deal. Every commission. Every payout. In real time.",
    body: "No Excel spreadsheets. No 'trust us'. Your partner portal shows every referred client, every deal stage, every commission calculation, and every payout — the moment the firm updates it.",
    features: [
      { icon: "📊", title: "Live deal tracking", body: "Every referred client flows through a visible pipeline. See stage changes the moment they happen — new lead, engaged, closed-won, paid — all timestamped." },
      { icon: "💰", title: "3-phase commission ledger", body: "Pending when the deal closes. Due when the firm collects the client payment. Paid when the money hits your account. Each status flip is auditable." },
      { icon: "🧾", title: "Batched payouts", body: "Commissions are batched, approved, and processed through the portal — with a full history of every batch, every entry, and the exact calculation behind each number." },
      { icon: "🌳", title: "Downline visibility", body: "See every partner below you, their deals, their commissions, and your override on each one. Zero hidden math." },
      { icon: "🔔", title: "Real-time notifications", body: "Get notified the moment a referral converts, a deal changes stage, or a payout is ready. Email, SMS, and in-portal bell." },
      { icon: "📱", title: "Mobile-first portal", body: "Installable PWA. Works on iPhone, Android, desktop. Refer and track from anywhere." },
    ],
  },
  credibility: {
    eyebrow: "Serious support. Serious credibility.",
    title: "Backed by top-tier tax law firms. Armed with a partner portal built for the long haul.",
    body: "This isn't a pop-up affiliate program. It's a production-grade partner infrastructure built on the same legal muscle that already recovers millions for clients.",
    firms: [
      { title: "Frost Law", body: "Nationally recognized tax controversy and tariff refund firm. Fintella's primary recovery partner for IEEPA tariff refund claims." },
      { title: "Furdock &amp; Foglia Law LLP", body: "Co-counsel firm with massive track record in refund recovery and collections. Partnered with ERC Tax Law to deliver cross-product results for shared clients." },
      { title: "ERC Tax Law", body: "ERC refund specialists inside the partner network. Your tariff client may also be an ERC client — and every recovery earns separately." },
    ],
    supportTiles: [
      { icon: "💬", title: "Live partner support chat" },
      { icon: "🔐", title: "Passkey + 2FA login security" },
      { icon: "📞", title: "Bridged click-to-call from portal" },
      { icon: "📚", title: "Training library + weekly live call" },
    ],
  },
  testimonials: {
    eyebrow: "What partners are saying",
    title: "Real partners. Real deals. Real commissions.",
    items: [],
  },
  resources: {
    eyebrow: "Partner-ready resources",
    title: "Everything you need to refer with confidence.",
    body: "Our training library is open to partners from day one. Here's a preview of what's inside.",
    items: [],
  },
  faq: {
    eyebrow: "Before you ask",
    title: "Frequently asked questions",
    useLiveData: true,
    categories: ["general", "commissions"],
    manualItems: [],
  },
  finalCta: {
    title: "Your network is worth more than you think.",
    body: "Apply in 60 seconds. We'll schedule a short qualification call, and if it's a fit you can be activated and earning within days.",
    primaryCta: "Apply Now →",
  },
  abTest: {
    enabled: false,
    headlineVariants: [],
  },
  pixels: {
    metaPixelId: "",
    googleAdsId: "",
    googleAdsConversionLabel: "",
    linkedInPartnerId: "",
    gtmContainerId: "",
  },
  seo: {
    title: "Fintella Partner Program — Earn 20% on Every Tariff Refund You Refer",
    description:
      "Refer clients to the top tariff-refund recovery firms in the country. Earn 20% direct commission plus downline overrides, with full real-time tracking, transparent payouts, and deep legal support.",
    ogImageUrl: "",
    canonicalUrl: "https://fintella.partners",
  },
  exitIntent: {
    enabled: false,
    title: "Before you go — grab the Partner Playbook",
    body: "A free PDF breaking down the opportunity, the commission structure, and how top partners are earning. No signup required — just your email.",
    cta: "Email me the Playbook",
    leadMagnetResourceId: "",
  },
  _meta: {
    version: 0,
    generatedAt: null,
  },
};

/**
 * Safe parse + merge-with-defaults. Missing keys fall through to
 * DEFAULT_LANDING_CONTENT so a partial edit never crashes the renderer.
 */
export function parseLandingContent(json: string): LandingContentData {
  let parsed: Partial<LandingContentData> = {};
  try {
    parsed = JSON.parse(json || "{}");
  } catch {
    parsed = {};
  }
  return deepMerge(DEFAULT_LANDING_CONTENT, parsed) as LandingContentData;
}

function deepMerge<T>(base: T, overlay: any): T {
  if (overlay === null || overlay === undefined) return base;
  if (Array.isArray(base)) {
    return (Array.isArray(overlay) ? overlay : base) as T;
  }
  if (typeof base === "object" && base !== null) {
    const result: any = { ...base };
    for (const key of Object.keys(overlay)) {
      const baseVal = (base as any)[key];
      const overVal = overlay[key];
      result[key] =
        typeof baseVal === "object" && baseVal !== null && !Array.isArray(baseVal)
          ? deepMerge(baseVal, overVal)
          : overVal;
    }
    return result;
  }
  return overlay !== undefined ? overlay : base;
}
