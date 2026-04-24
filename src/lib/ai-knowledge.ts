/**
 * PartnerOS AI — Product Specialist knowledge assembly
 *
 * Builds the large cached system-prompt block for Tara. Phase 2a read
 * TrainingModule.content + FAQ rows. Phase 2b (this revision) extends
 * to PDF extracted text + TrainingGlossary. Phase 2c extends to
 * audio/video transcripts + weekly-call recording transcripts.
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
  const [version, modules, resources, faqs, glossary] = await Promise.all([
    getKnowledgeVersion(),
    prisma.trainingModule.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { title: true, category: true, content: true },
    }),
    // Phase 2b — published PDF resources with extracted text.
    // Phase 2c — published audio resources with transcripts.
    // One query, OR'd on the "has text" side so both types flow in.
    prisma.trainingResource.findMany({
      where: {
        published: true,
        OR: [
          { fileType: "pdf", extractedText: { not: null } },
          { fileType: "audio", audioTranscript: { not: null } },
        ],
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: {
        title: true,
        category: true,
        fileType: true,
        extractedText: true,
        audioTranscript: true,
      },
    }),
    prisma.fAQ.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { question: true, answer: true },
    }),
    // Phase 2b — glossary
    prisma.trainingGlossary.findMany({
      where: { published: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { term: "asc" }],
      select: { term: true, aliases: true, definition: true },
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
    "# Resource documents (PDFs + audio transcripts)",
    resources.length
      ? resources
          .map((r) => {
            const header = `## ${r.title}${r.category ? ` [${r.category}]` : ""} [${r.fileType}]`;
            const body = r.fileType === "audio" ? r.audioTranscript : r.extractedText;
            return `${header}\n\n${body ?? ""}`;
          })
          .join("\n\n")
      : "(no resource content available)",
    "",
    "# FAQs",
    faqs.length
      ? faqs.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n")
      : "(no FAQs published)",
    "",
    "# Glossary",
    glossary.length
      ? glossary
          .map((g) => {
            const aliases =
              g.aliases && g.aliases.length
                ? ` (aka: ${g.aliases.join(", ")})`
                : "";
            return `- **${g.term}**${aliases} — ${g.definition}`;
          })
          .join("\n")
      : "(no glossary entries)",
  ].join("\n\n");

  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}
