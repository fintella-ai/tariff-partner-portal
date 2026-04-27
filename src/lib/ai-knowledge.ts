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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [version, modules, resources, faqs, glossary, meetingRecordings, callRecordings, rebuttals] = await Promise.all([
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
    // Phase 2c — conference recordings with transcripts
    prisma.conferenceSchedule.findMany({
      where: { recordingTranscript: { not: null }, isActive: true },
      select: { title: true, schedule: true, recordingTranscript: true },
      orderBy: { nextCall: "desc" },
      take: 10,
    }),
    // Phase 2c — recent call recordings with transcripts (last 30 days)
    prisma.callLog.findMany({
      where: { recordingTranscript: { not: null }, createdAt: { gte: thirtyDaysAgo } },
      select: { recordingTranscript: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.rebuttal.findMany({
      where: { status: "approved" },
      orderBy: [{ category: "asc" }, { usageCount: "desc" }],
      select: { objection: true, approvedResponse: true, category: true },
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
    "",
    "# Meeting Recordings",
    meetingRecordings.length
      ? meetingRecordings
          .map(
            (m) =>
              `## ${m.title}${m.schedule ? ` (${m.schedule})` : ""}\n\n${m.recordingTranscript}`
          )
          .join("\n\n")
      : "(no meeting recordings transcribed)",
    "",
    "# Recent Call Recordings",
    callRecordings.length
      ? callRecordings
          .map(
            (c) =>
              `## Call on ${c.createdAt.toISOString().slice(0, 10)}\n\n${c.recordingTranscript}`
          )
          .join("\n\n")
      : "(no recent call recordings transcribed)",
    "",
    "# Objection Rebuttals (partner-submitted, admin-approved)",
    "When a partner asks how to handle a specific objection from a prospect, check this section first. Cite the rebuttal and adapt it to the conversation context.",
    rebuttals.length
      ? rebuttals
          .map(
            (r) =>
              `### Objection [${r.category}]: "${r.objection}"\n\n**Response:** ${r.approvedResponse}`
          )
          .join("\n\n")
      : "(no approved rebuttals yet — encourage partners to submit objections they encounter)",
  ].join("\n\n");

  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}
