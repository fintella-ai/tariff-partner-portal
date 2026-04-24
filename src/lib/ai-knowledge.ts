/**
 * PartnerOS AI — Product Specialist knowledge assembly
 *
 * Builds the large cached system-prompt block for Tara. Phase 2a reads
 * TrainingModule.content + FAQ rows. Phase 2b extends to PDF extracted
 * text + TrainingGlossary. Phase 2c extends to audio/video transcripts
 * + weekly-call recording transcripts.
 *
 * The cache-version comment at the top flips on every knowledge
 * mutation (see bumpKnowledgeVersion), forcing Anthropic's prompt cache
 * to rewrite. Effective cost is a one-time ~$0.30-0.50 cache-write per
 * save; all subsequent requests hit the cache cheaply.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { renderComplianceBlock } from "./ai-compliance";
import { getKnowledgeVersion } from "./ai-knowledge-version";

export async function buildProductSpecialistPrompt(): Promise<Anthropic.Messages.TextBlockParam> {
  const [version, modules, faqs] = await Promise.all([
    getKnowledgeVersion(),
    prisma.trainingModule.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { title: true, category: true, content: true },
    }),
    prisma.fAQ.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { question: true, answer: true },
    }),
  ]);

  const text = [
    `<!-- knowledge version: ${version.toString()} -->`,
    renderComplianceBlock(),
    "",
    "# Training modules",
    modules.length
      ? modules
          .map(
            (m) =>
              `## ${m.title} [${m.category}]\n\n${m.content ?? "(no content)"}`
          )
          .join("\n\n")
      : "(no training modules published)",
    "",
    "# FAQs",
    faqs.length
      ? faqs.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")
      : "(no FAQs published)",
  ].join("\n\n");

  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}
