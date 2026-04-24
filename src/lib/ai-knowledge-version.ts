/**
 * PartnerOS AI — knowledge version bump helper
 *
 * Upserts the AiKnowledgeVersion singleton on every training content
 * mutation. The singleton's version number is embedded as an HTML
 * comment at the top of Tara's cached system prompt, so bumping it
 * flips the prompt's exact text and invalidates Anthropic's prompt
 * cache on the next request.
 */
import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export async function bumpKnowledgeVersion(): Promise<bigint> {
  const row = await prisma.aiKnowledgeVersion.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, version: BigInt(1) },
    update: { version: { increment: 1 } },
  });
  return row.version;
}

export async function getKnowledgeVersion(): Promise<bigint> {
  const row = await prisma.aiKnowledgeVersion.findUnique({
    where: { id: SINGLETON_ID },
  });
  return row?.version ?? BigInt(0);
}
