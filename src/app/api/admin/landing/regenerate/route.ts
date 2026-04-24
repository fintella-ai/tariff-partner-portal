import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";
import {
  DEFAULT_LANDING_CONTENT,
  parseLandingContent,
  LandingContentData,
} from "@/lib/landingContent";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const ADMIN_ROLES = ["super_admin", "admin"];

/**
 * POST /api/admin/landing/regenerate
 *
 * Auto-assembles landing-page copy from existing portal data. Uses a
 * v0-style 3-layer prompt (product surface / design spec / context):
 *   - Product surface: TrainingModule content, FAQ list, TrainingResource
 *     descriptions, commission math, firm info
 *   - Design spec: Inter + gold accent, dark portal theme, B2B-authoritative
 *     tone
 *   - Context: Fintella is a tariff-refund referral network; target audience
 *     is CPAs, attorneys, business-broker networks, consultants with SMB
 *     importer clients
 *
 * Output is written to LandingContent.draft. The admin editor shows the
 * diff between draft and published, and the admin clicks Publish to
 * promote draft → published.
 *
 * Graceful demo-gate: if ANTHROPIC_API_KEY is unset, the endpoint stitches
 * together a deterministic assembly from portal data WITHOUT AI rewriting
 * (still useful — just uses the raw titles/descriptions from the DB).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  const sectionFilter =
    Array.isArray(body.sections) && body.sections.length > 0
      ? (body.sections as string[])
      : null;

  // Load portal data
  const [trainingModules, faqs, resources, settings, partnerCount] = await Promise.all([
    prisma.trainingModule.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
      select: { title: true, description: true, category: true, content: true, duration: true },
    }),
    prisma.fAQ.findMany({
      where: { published: true, category: { in: ["general", "commissions", "leads"] } },
      orderBy: { sortOrder: "asc" },
      select: { question: true, answer: true, category: true },
    }),
    prisma.trainingResource.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, description: true, fileType: true, category: true },
    }),
    prisma.portalSettings.findUnique({ where: { id: "global" } }),
    prisma.partner.count({ where: { status: "active" } }),
  ]);

  const existing = await prisma.landingContent.findUnique({ where: { id: "global" } });
  const currentDraft = existing ? parseLandingContent(existing.draft) : DEFAULT_LANDING_CONTENT;

  const client = getAnthropicClient();

  let nextDraft: LandingContentData;

  if (!client) {
    // Demo-gate: no AI, just deterministic assembly from DB
    nextDraft = deterministicAssembly({
      currentDraft,
      trainingModules,
      faqs,
      resources,
      partnerCount,
      settings,
    });
  } else {
    try {
      nextDraft = await aiAssembly({
        client,
        currentDraft,
        trainingModules,
        faqs,
        resources,
        partnerCount,
        settings,
        instructions,
        sectionFilter,
      });
    } catch (err) {
      console.error("[landing/regenerate] AI assembly failed, falling back to deterministic", err);
      nextDraft = deterministicAssembly({
        currentDraft,
        trainingModules,
        faqs,
        resources,
        partnerCount,
        settings,
      });
    }
  }

  nextDraft._meta = {
    version: (currentDraft._meta?.version ?? 0) + 1,
    generatedAt: new Date().toISOString(),
  };

  const saved = await prisma.landingContent.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      draft: JSON.stringify(nextDraft),
      published: JSON.stringify(DEFAULT_LANDING_CONTENT),
      lastRegeneratedAt: new Date(),
      lastRegeneratedBy: (session.user as any).id ?? null,
    },
    update: {
      draft: JSON.stringify(nextDraft),
      lastRegeneratedAt: new Date(),
      lastRegeneratedBy: (session.user as any).id ?? null,
    },
  });

  return NextResponse.json({
    success: true,
    draft: parseLandingContent(saved.draft),
    ai: !!client,
    sourcesUsed: {
      trainingModules: trainingModules.length,
      faqs: faqs.length,
      resources: resources.length,
      activePartners: partnerCount,
    },
  });
}

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY || "";
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

/**
 * Deterministic (no-AI) assembly. Maps portal data directly into landing
 * content slots with minimal re-writing — intentionally conservative.
 */
function deterministicAssembly(input: {
  currentDraft: LandingContentData;
  trainingModules: Array<{ title: string; description: string | null; category: string; content: string | null; duration: string | null }>;
  faqs: Array<{ question: string; answer: string; category: string }>;
  resources: Array<{ id: string; title: string; description: string | null; fileType: string; category: string | null }>;
  partnerCount: number;
  settings: any;
}): LandingContentData {
  const next = JSON.parse(JSON.stringify(input.currentDraft)) as LandingContentData;

  // Firm info from PortalSettings
  if (input.settings) {
    if (input.settings.firmShort) {
      next.hero.headlineTop = `Refer ${input.settings.firmShort}-powered refund clients.`;
    }
  }

  // Stats: live partner count
  if (input.partnerCount > 0) {
    next.opportunity.stats = [
      { headline: "20%", sub: "Direct commission on every referred deal" },
      { headline: `${input.partnerCount}+`, sub: "Active partners in the network" },
      { headline: "$0", sub: "Cost to join. No fees, no minimums, no lockup." },
    ];
  }

  // Training preview: top 6 resources as lead-magnet preview
  next.resources.items = input.resources.slice(0, 6).map((r) => ({
    trainingResourceId: r.id,
    displayTitle: r.title,
    displayDescription: r.description || "",
  }));

  // FAQ — already configured for live pull by default; no change needed

  return next;
}

/**
 * AI assembly via Claude. 3-layer prompt (product surface / design spec /
 * context). Returns a complete LandingContentData JSON object.
 */
async function aiAssembly(input: {
  client: Anthropic;
  currentDraft: LandingContentData;
  trainingModules: Array<{ title: string; description: string | null; category: string; content: string | null; duration: string | null }>;
  faqs: Array<{ question: string; answer: string; category: string }>;
  resources: Array<{ id: string; title: string; description: string | null; fileType: string; category: string | null }>;
  partnerCount: number;
  settings: any;
  instructions: string;
  sectionFilter: string[] | null;
}): Promise<LandingContentData> {
  // PRODUCT SURFACE — portal data, kept terse to control token use
  const trainingBlurbs = input.trainingModules
    .slice(0, 15)
    .map((m) => `- [${m.category}] ${m.title}${m.description ? ` — ${m.description}` : ""}${m.content ? ` (content: ${m.content.slice(0, 400).replace(/\n/g, " ")}...)` : ""}`)
    .join("\n");
  const faqBlurbs = input.faqs
    .slice(0, 20)
    .map((f) => `- Q: ${f.question}\n  A: ${f.answer.slice(0, 300).replace(/\n/g, " ")}`)
    .join("\n");
  const resourceBlurbs = input.resources
    .slice(0, 12)
    .map((r) => `- ${r.title}${r.description ? ` — ${r.description}` : ""} (${r.fileType})`)
    .join("\n");

  const productSurface = `
## PRODUCT SURFACE (ground truth — use these facts, do not invent)

### Firm
- Name: ${FIRM_NAME} ("${FIRM_SHORT}")
- Slogan: ${input.settings?.firmSlogan || "Fighting for what's owed, reclaiming what's fair."}
- Active partners: ${input.partnerCount}+
- Primary product: IEEPA tariff refund recovery for U.S. importers
- Recovery network: vetted partner providers (trade attorneys, licensed customs brokers, CPAs, project managers)
- Cross-product opportunities: Tariff refunds, ERC credits, R&D credits, SALT, Litigation recovery

### Verified market facts (use these — do not invent numbers)
- $166B+ owed to approximately 330,000 U.S. importers following Supreme Court's IEEPA decision (source: National Law Review / CNN, April 2026)
- $22M/day in statutory interest continues to accrue on unfiled refund claims
- Higher estimates up to $175B (Quinn Emanuel)
- Strict 180-day protest deadline from the date of liquidation — a hard legal cutoff that creates real urgency
- Trump administration is publicly pressuring companies to file claims (CNBC, April 21 2026) — this is a tailwind
- Contingency-fee industry standard: clients pay nothing until their refund arrives
- Downstream-business theory: breach-of-contract + unjust-enrichment claims available to businesses who didn't import directly but paid the tariff pass-through — this dramatically widens the addressable client pool beyond direct importers

### Commission structure
- Total partner commission capped at 25% of firm fee (L1 max)
- L1 direct deal: L1 earns their assigned rate (10/15/20/25%)
- L2 deal: L2 earns 10-20%, L1 earns override = L1 rate − L2 rate
- L3 deal: L3 earns 10-15%, L2 overrides L3, L1 overrides L2
- 3-phase ledger: pending → due → paid, all status changes visible in partner portal

### Training modules (${input.trainingModules.length} published)
${trainingBlurbs || "(none yet)"}

### Existing FAQs (${input.faqs.length} published)
${faqBlurbs || "(none yet)"}

### Training resources / PDFs (${input.resources.length} published)
${resourceBlurbs || "(none yet)"}
`;

  const designSpec = `
## DESIGN SPEC

- Brand tone: Authoritative, trustworthy, specific. B2B, not hype. Reads like a top-tier consulting firm, NOT a crypto affiliate program.
- Voice: Second-person direct ("you earn", "your network"). Short sentences. Specific numbers.
- Section headlines: Strong declaratives. No questions. No cliches like "Unlock your potential".
- FAQ tone: Short and plain. Answer the objection in 1-3 sentences.
- Testimonials (if generated): Realistic partner names, concrete numbers, specific outcomes. Do NOT invent real people — use generic placeholder names like "Sarah M., CPA at Midwest Tax Partners".
- Avoid hype words: "revolutionary", "game-changing", "ultimate", "unlock", "crush", "10x".
- Use concrete $ figures where the data supports them.
`;

  const context = `
## CONTEXT

- Target audience: CPAs, attorneys, business-broker networks, tax consultants, industry associations — professionals who already serve SMB business owners and can introduce Fintella's services to them.
- SECONDARY audience: existing Fintella partners recruiting downline (they share a recruitment link that lands here).
- CTA: "Apply to partner program" (primary). Applications are leads — they become Partners only after admin review + qualification call.
- The landing page is Fintella's public front door at https://fintella.partners.
- Compliance constraints: NEVER claim embedded signing. NEVER claim public self-serve signup (partners are invite-only — applicants fill a form, admin approves, invite is sent). NEVER claim 24/7 support if we can't back it up.
${input.instructions ? `\n### Admin's specific instructions for this regeneration:\n${input.instructions}` : ""}
${input.sectionFilter ? `\n### Sections to update THIS RUN (leave others unchanged):\n${input.sectionFilter.join(", ")}` : ""}
`;

  const taskSpec = `
## TASK

Return a complete LandingContentData JSON object. Copy structure and field names EXACTLY from the schema below. Every field must be present.

SCHEMA (fill every key):
\`\`\`json
${JSON.stringify(
    {
      hero: {
        eyebrow: "string",
        headlineTop: "string",
        headlineAccent: "string (rendered in gold gradient)",
        subheadline: "string",
        primaryCta: "string",
        secondaryCta: "string",
        videoUrl: "",
        videoPosterUrl: "",
        trustBadges: ["3-4 short ✓ bullets"],
      },
      lawFirmStrip: {
        prefix: "In partnership with",
        firms: [{ name: "Partner Provider 1" }, { name: "Partner Provider 2" }],
      },
      opportunity: { eyebrow: "string", title: "string", body: "string", stats: [{ headline: "string", sub: "string" }] },
      crossProduct: { eyebrow: "string", title: "string", body: "string", products: [{ icon: "emoji", title: "string", body: "string" }] },
      howItWorks: { eyebrow: "string", title: "string", body: "string", steps: [{ num: "01", title: "string", body: "string" }] },
      downline: { eyebrow: "string", title: "string", body: "string", bullets: ["string"] },
      transparency: { eyebrow: "string", title: "string", body: "string", features: [{ icon: "emoji", title: "string", body: "string" }] },
      credibility: {
        eyebrow: "string",
        title: "string",
        body: "string",
        firms: [{ title: "firm name", body: "one-paragraph description" }],
        supportTiles: [{ icon: "emoji", title: "string" }],
      },
      testimonials: { eyebrow: "string", title: "string", items: [{ quote: "string", authorName: "string", authorRole: "string", authorCompany: "string" }] },
      resources: { eyebrow: "string", title: "string", body: "string", items: [] },
      faq: { eyebrow: "string", title: "string", useLiveData: true, categories: ["general", "commissions"], manualItems: [] },
      finalCta: { title: "string", body: "string", primaryCta: "string" },
    },
    null,
    2,
  )}
\`\`\`

Rules:
- Every section must be filled — do not omit any top-level key from the schema above.
- \`hero.headlineAccent\` is the phrase rendered in gold gradient — make it the strongest 3-6 words (e.g. "Earn 20% on every deal.").
- \`testimonials.items\` should be 3 realistic B2B partner testimonials with concrete numbers. Use generic placeholder names + cities, never real identifiable people.
- \`resources.items\` can be [] — the renderer fills it from the real training-resource DB rows.
- \`faq\` should use live DB data (\`useLiveData: true\`) unless the admin's instructions say otherwise.
- Return ONLY the JSON object, no prose, no markdown fences around it, no code block.
`;

  const response = await input.client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: productSurface + "\n" + designSpec + "\n" + context + "\n" + taskSpec,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

  // Strip any markdown fences in case the model disobeys
  const jsonStr = raw.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();

  const parsed = JSON.parse(jsonStr);

  // Merge with current draft so un-returned sections (e.g. abTest, pixels,
  // exitIntent — admin-configured, not AI-generated) are preserved.
  return {
    ...input.currentDraft,
    ...parsed,
    abTest: input.currentDraft.abTest,
    pixels: input.currentDraft.pixels,
    exitIntent: input.currentDraft.exitIntent,
    seo: { ...input.currentDraft.seo, ...(parsed.seo || {}) },
    _meta: input.currentDraft._meta,
  };
}
