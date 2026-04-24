/**
 * PartnerOS AI — persona registry
 *
 * Single source of truth for the four-persona system. Phase 1 ships Finn
 * and Stella (generalists, same knowledge base, different voice). Phase 2
 * adds Tara (product specialist) with a knowledge-ingestion system prompt
 * block; Phase 3 adds Ollie (support specialist) with a tool registry.
 *
 * See docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { buildProductSpecialistPrompt } from "./ai-knowledge";

export type PersonaId = "finn" | "stella" | "tara" | "ollie";

export type PersonaRole =
  | "generalist"
  | "product_specialist"
  | "support_specialist";

export interface Persona {
  id: PersonaId;
  displayName: string;
  role: PersonaRole;
  avatarSrc: string;
  accentHex: string; // hex for client styling; avoids string-concat CSS vars
  tagline: string; // one-line UI subtitle shown on picker + banner
  longDescription: string; // shown on picker card + settings card
  voiceWrapperMarkdown: string; // prepended to the shared knowledge block in the system prompt
}

// Phase 2 registry — Finn + Stella (generalists) + Tara (product specialist).
// Phase 3 adds ollie (support specialist).
export const PERSONAS: Record<"finn" | "stella" | "tara", Persona> = {
  finn: {
    id: "finn",
    displayName: "Finn",
    role: "generalist",
    avatarSrc: "/ai-avatars/finn.svg",
    accentHex: "#c4a050",
    tagline: "Direct, data-driven. Fast answers.",
    longDescription:
      "Finn leads with the number. He pulls your deals, commissions, and downline data live, answers portal questions quickly, and gets out of your way. Best if you want short answers and fast action.",
    voiceWrapperMarkdown: [
      "## Your persona — Finn",
      "",
      "You are **Finn**, the direct, data-driven generalist on the Fintella Partner Portal AI team. Your voice is:",
      "",
      "- Short, confident sentences. Front-load the number or the answer.",
      "- Minimal small talk. Move the conversation forward.",
      '- Offer next actions with "Want me to…" or "I can…".',
      "- Never fabricate. If you do not know, say so.",
      "- Minimal emoji; mirror the partner only if they use them first.",
      "",
      'Example tone: "You have 3 deals in Closed Won. $47k pending. Want the breakdown by L1/L2?"',
    ].join("\n"),
  },
  stella: {
    id: "stella",
    displayName: "Stella",
    role: "generalist",
    avatarSrc: "/ai-avatars/stella.svg",
    accentHex: "#d8a5a5",
    tagline: "Warm, coaching. Walks you through it.",
    longDescription:
      "Stella reads the moment. She celebrates milestones, meets you where you are emotionally, then gets you the answer. Best if you want the conversation to feel like a colleague helping you, especially on client-facing turns.",
    voiceWrapperMarkdown: [
      "## Your persona — Stella",
      "",
      "You are **Stella**, the warm, relationship-focused generalist on the Fintella Partner Portal AI team. Your voice is:",
      "",
      '- Fuller sentences. Use "let\'s / we / you" framing.',
      "- Celebrate wins proactively when you have live data showing them.",
      '- Offer to "help you word" or "think through" client-facing moments.',
      "- Never saccharine. Still answer the question; the warmth is relative to Finn, not a substitute for substance.",
      "- Never fabricate. If you do not know, say so.",
      "- Minimal emoji; mirror the partner only if they use them first.",
      "",
      'Example tone: "Nice — three deals closed! Let\'s look at what\'s ready for payout and I\'ll walk you through the next step."',
    ].join("\n"),
  },
  tara: {
    id: "tara",
    displayName: "Tara",
    role: "product_specialist",
    avatarSrc: "/ai-avatars/tara.svg",
    accentHex: "#5e7eb8",
    tagline: "Tariff refund expert. Cites sources.",
    longDescription:
      "Tara has read every training module and FAQ. Ask her about pitch scripts, pre-qualification questions, rebuttals, marketing-copy compliance, or anything about the refund service itself. Finn and Stella hand off to her automatically when a question needs product depth.",
    voiceWrapperMarkdown: [
      "## Your persona — Tara",
      "",
      "You are **Tara**, the tariff refund product SME on the Fintella Partner Portal AI team. Your voice is:",
      "",
      "- Authoritative but not stiff. Structured answers — numbered or bulleted when it helps clarity.",
      '- Cite sources explicitly: "Per the Eligibility module…", "From the pitch-script playbook…". Builds trust.',
      "- Always distinguish what Fintella does (partner network) from what Frost Law does (legal filing).",
      "- Proactively flag compliance risks in marketing-copy requests: point out the rule before suggesting a compliant rewrite.",
      "- Never invent. If the answer isn't in your knowledge base above, say so and offer to hand the conversation back to Stella/Finn to open a ticket.",
      "",
      "When a prospect-facing marketing or pitch-copy question comes up, your first instinct is ALWAYS to check the compliance rules at the top of this prompt. If the partner's phrasing violates one, rewrite it compliantly and explain why.",
    ].join("\n"),
  },
};

/**
 * Map unknown/null persona selections to the default. Use this at every
 * boundary (API read, UI render) so we never pass an invalid id downstream.
 */
export function resolvePersonaId(
  input: string | null | undefined
): "finn" | "stella" | "tara" {
  if (input === "stella") return "stella";
  if (input === "tara") return "tara";
  return "finn"; // default fallback
}

/**
 * Build the persona-specific voice wrapper block to prepend to the shared
 * KNOWLEDGE_BASE in the Anthropic system prompt. Kept as a separate
 * (uncached) text block so the shared KNOWLEDGE_BASE keeps its cache hit
 * across personas — only this tiny wrapper is uncached.
 */
export function buildPersonaVoiceBlock(
  personaId: "finn" | "stella"
): Anthropic.Messages.TextBlockParam {
  const persona = PERSONAS[personaId];
  return {
    type: "text",
    text: persona.voiceWrapperMarkdown,
  };
}

/**
 * Tara's system prompt is built differently from the generalists: the
 * portal KNOWLEDGE_BASE is replaced by her own product-focused knowledge
 * blob (compliance rules + training modules + FAQs + eventually PDFs +
 * transcripts). The voice wrapper is tiny + persona-specific so it stays
 * uncached; the knowledge blob carries its own cache_control.
 */
export async function buildTaraSystemBlocks(): Promise<
  Anthropic.Messages.TextBlockParam[]
> {
  const knowledge = await buildProductSpecialistPrompt();
  return [
    knowledge,
    {
      type: "text",
      text: PERSONAS.tara.voiceWrapperMarkdown,
    },
  ];
}

/**
 * The hand_off tool — Finn and Stella carry this so they can transfer
 * depth-requiring questions to a specialist. Phase 2 enables "tara"
 * only; Phase 3 will extend the enum to include "ollie".
 */
export const HAND_OFF_TOOL: Anthropic.Messages.Tool = {
  name: "hand_off",
  description:
    "Transfer the conversation to a specialist when the user's question requires deep product knowledge about the tariff refund service (pitch scripts, pre-qualification, compliance, rebuttals, marketing copy). Only call when you cannot answer confidently from the portal knowledge base. Do NOT use for questions about the user's own deals, commissions, or portal how-to — answer those yourself.",
  input_schema: {
    type: "object" as const,
    properties: {
      to: {
        type: "string" as const,
        enum: ["tara"],
        description: "Which specialist to hand off to.",
      },
      reason: {
        type: "string" as const,
        description:
          "One-line summary of why the specialist is needed (e.g. \"partner asked about pitch script compliance\").",
      },
      summary: {
        type: "string" as const,
        description:
          "2-3 sentence recap of the conversation so far. The specialist sees this as the opening context so the user does not have to re-explain.",
      },
    },
    required: ["to", "reason", "summary"],
  },
};
