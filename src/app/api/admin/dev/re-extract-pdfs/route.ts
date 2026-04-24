import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractPdfTextFromUrl } from "@/lib/pdf-extraction";
import { bumpKnowledgeVersion } from "@/lib/ai-knowledge-version";

/**
 * POST /api/admin/dev/re-extract-pdfs
 *
 * Iterates every published TrainingResource with fileType="pdf" and
 * re-runs PDF text extraction. Existing extractedText is overwritten.
 * Safe to run repeatedly; non-fatal on per-resource failures.
 *
 * Useful to backfill resources uploaded before the extract-on-upload
 * hook landed (PR #535 / Phase 2b). Surfaced as a button in /admin/dev.
 *
 * Super admin only — same scope as the rest of /admin/dev.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resources = await prisma.trainingResource.findMany({
    where: { fileType: "pdf" },
    select: { id: true, title: true, fileUrl: true },
  });

  let succeeded = 0;
  let failed = 0;
  const failures: { id: string; title: string; reason: string }[] = [];

  for (const r of resources) {
    try {
      const result = await extractPdfTextFromUrl(r.fileUrl);
      if (result.text) {
        await prisma.trainingResource.update({
          where: { id: r.id },
          data: { extractedText: result.text, extractedAt: new Date() },
        });
        succeeded++;
      } else {
        failed++;
        failures.push({
          id: r.id,
          title: r.title,
          reason: "empty extraction (fetch failed or PDF unparseable)",
        });
      }
    } catch (err: any) {
      failed++;
      failures.push({
        id: r.id,
        title: r.title,
        reason: err?.message ?? "unknown error",
      });
    }
  }

  if (succeeded > 0) {
    await bumpKnowledgeVersion().catch((e) =>
      console.error("[ai-knowledge] bumpKnowledgeVersion failed", e)
    );
  }

  return NextResponse.json({
    total: resources.length,
    succeeded,
    failed,
    failures,
  });
}
