/**
 * AI Video Script Generation — generates structured slide presentations
 * from PDF training resource content via Claude API.
 *
 * Demo-gated: returns a hardcoded demo script when ANTHROPIC_API_KEY is unset.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface VideoScene {
  heading: string;
  bullets: string[];
  narration: string;
  durationSec: number;
  visualHint: string;
}

export interface VideoScript {
  title: string;
  totalDurationSec: number;
  scenes: VideoScene[];
}

// ─── CONFIG ─────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
}

// ─── SCRIPT GENERATION ──────────────────────────────────────────────────────

interface GenerateOpts {
  moduleTitle: string;
  moduleCategory: string;
  moduleContent?: string | null;
  pdfTexts: { title: string; text: string }[];
  targetDurationMin?: number;
}

export async function generateVideoScript(
  opts: GenerateOpts
): Promise<VideoScript> {
  const client = getClient();
  if (!client) {
    return buildDemoScript(opts.moduleTitle);
  }

  const targetMin = opts.targetDurationMin ?? 3;
  const sceneCount = Math.max(6, Math.min(12, Math.round(targetMin * 3)));

  const pdfContext = opts.pdfTexts
    .map((p) => `### ${p.title}\n${p.text.slice(0, 4000)}`)
    .join("\n\n---\n\n");

  const moduleContext = opts.moduleContent
    ? `\n\n### Module Written Content\n${opts.moduleContent.slice(0, 3000)}`
    : "";

  const prompt = `You are creating a training video script for the Fintella partner portal.

Fintella is a partner referral network that helps U.S. importers recover overpaid tariffs (IEEPA, Section 301) through vetted recovery providers (trade attorneys, licensed customs brokers, CPAs). Partners earn commissions (10-25% of the professional fee) on deals they refer. The commission model is a waterfall: L1 partners earn on direct referrals, L2/L3 partners earn on their own deals while the upline keeps overrides.

## Training Module
- **Title**: ${opts.moduleTitle}
- **Category**: ${opts.moduleCategory}
${moduleContext}

## Source Material (from uploaded PDF resources)
${pdfContext || "(No PDF content available — generate from the module title and category using your knowledge of tariff recovery partner programs.)"}

## Your Task
Generate a structured video script with exactly ${sceneCount} scenes targeting ${targetMin} minutes total (${targetMin * 60} seconds). Each scene should be 15-25 seconds.

The video will be rendered as an auto-advancing slide presentation with optional text-to-speech narration.

## Tone
- **Uplifting and optimistic** — this is an exciting opportunity, make partners feel energized
- **Simple and clear** — break complex topics into easy, digestible steps. Make everything feel doable
- **Informative and to the point** — no fluff, every sentence earns its place
- **Encouraging** — use language like "Here's the simple version", "All you need to do is", "The best part is"

## Rules
- Write for partners who are professionals (CPAs, attorneys, trade advisors) but may be new to tariff recovery
- Make every topic feel approachable — if something sounds complex, simplify it with an analogy or "think of it this way"
- Include concrete qualifying criteria, objection handling, or process steps where relevant to the topic
- Narration text should be conversational, warm, and natural (it will be read aloud by TTS)
- Each narration should be 20-40 words (roughly 15-20 seconds when spoken)
- Bullet points should be concise (8-15 words each), 2-4 per slide — use active, positive language
- Visual hints should be single emojis that match the slide content and feel upbeat
- The first scene is always a welcoming intro that builds excitement, the last is always an encouraging call-to-action

Respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "title": "string",
  "totalDurationSec": number,
  "scenes": [
    {
      "heading": "string",
      "bullets": ["string", "string"],
      "narration": "string (20-40 words, conversational)",
      "durationSec": number (15-25),
      "visualHint": "single emoji"
    }
  ]
}`;

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );

    if (!textBlock?.text) {
      console.warn("[ai-video] No text in Claude response");
      return buildDemoScript(opts.moduleTitle);
    }

    const jsonStr = textBlock.text
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(jsonStr) as VideoScript;

    if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      console.warn("[ai-video] Invalid script structure");
      return buildDemoScript(opts.moduleTitle);
    }

    parsed.totalDurationSec = parsed.scenes.reduce(
      (sum, s) => sum + (s.durationSec || 20),
      0
    );

    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-video] generateVideoScript error:", msg);
    return buildDemoScript(opts.moduleTitle);
  }
}

// ─── DEMO FALLBACK ──────────────────────────────────────────────────────────

function buildDemoScript(title: string): VideoScript {
  return {
    title: title || "Training Module",
    totalDurationSec: 180,
    scenes: [
      {
        heading: "Welcome to This Module",
        bullets: [
          "Overview of what you'll learn",
          "Why this topic matters for your success",
          "Key takeaways to watch for",
        ],
        narration:
          "Welcome to this training module. In the next few minutes, we'll cover everything you need to know to start putting this into practice right away.",
        durationSec: 20,
        visualHint: "👋",
      },
      {
        heading: "The Fintella Opportunity",
        bullets: [
          "Over $166 billion in tariff refunds available",
          "Partners earn 10-25% commission on firm fees",
          "Three-tier waterfall commission structure",
        ],
        narration:
          "The opportunity is massive. Over one hundred sixty-six billion dollars in tariff refunds are waiting to be claimed, and you earn a commission on every deal you refer.",
        durationSec: 20,
        visualHint: "💰",
      },
      {
        heading: "Who Qualifies?",
        bullets: [
          "U.S. importers paying IEEPA or Section 301 duties",
          "Minimum $300K in annual import volume",
          "Must have customs documentation available",
        ],
        narration:
          "Your ideal prospect is any U.S. importer paying elevated tariffs. Focus on businesses with at least three hundred thousand in annual imports who can provide their customs records.",
        durationSec: 20,
        visualHint: "🎯",
      },
      {
        heading: "Starting the Conversation",
        bullets: [
          "Ask about their import volume and tariff exposure",
          "Listen for pain points around rising costs",
          "Position recovery as found money, not a gamble",
        ],
        narration:
          "Start by asking about their import costs. When they mention tariffs eating into margins, that's your opening. Frame recovery as money they've already overpaid — not a speculative bet.",
        durationSec: 20,
        visualHint: "🗣️",
      },
      {
        heading: "Common Objections",
        bullets: [
          '"We already have a customs broker" — brokers file, not recover',
          '"This sounds too good to be true" — it\'s a legal process, not a scheme',
          '"We don\'t have time" — Frost Law AZ, LLC handles everything',
        ],
        narration:
          "You'll hear objections. The most common is that they already have a customs broker. Remind them that brokers handle filing, not recovery — these are different processes.",
        durationSec: 25,
        visualHint: "🛡️",
      },
      {
        heading: "Submitting Your Referral",
        bullets: [
          "Use the Submit Client form in your portal",
          "Or share your unique referral link",
          "Client receives a guided intake from Frost Law AZ, LLC",
        ],
        narration:
          "When your prospect is ready, submit them through the portal or share your referral link. Frost Law AZ, LLC takes it from there — scheduling consultations, collecting documents, and filing the claim.",
        durationSec: 20,
        visualHint: "📋",
      },
      {
        heading: "How You Get Paid",
        bullets: [
          "Commissions calculated on the firm's contingency fee",
          "Pending → Due → Paid lifecycle in your ledger",
          "Set up ACH, wire, check, or PayPal in Settings",
        ],
        narration:
          "When a case closes successfully, your commission moves through pending, due, and paid stages. Make sure your payout info is set up in Account Settings so there's no delay.",
        durationSec: 20,
        visualHint: "💸",
      },
      {
        heading: "Your Next Steps",
        bullets: [
          "Complete your partnership agreement",
          "Join the next Live Weekly call",
          "Share your referral link with your first prospect",
        ],
        narration:
          "Here's what to do right now: finish your agreement, join the next Live Weekly call to learn what's working, and reach out to your first qualified prospect. Let's build this together.",
        durationSec: 20,
        visualHint: "🚀",
      },
    ],
  };
}
