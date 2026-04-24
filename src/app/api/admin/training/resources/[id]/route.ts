import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bumpKnowledgeVersion } from "@/lib/ai-knowledge-version";
import { extractPdfTextFromUrl } from "@/lib/pdf-extraction";
import { transcribeAudioFromUrl } from "@/lib/transcription";

/**
 * PUT /api/admin/training/resources/[id]
 *
 * Updates an existing training resource by ID.
 * Body contains optional fields to update.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const id = params.id;
    const body = await req.json();

    // Build update data from provided fields only
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "title",
      "description",
      "fileUrl",
      "fileType",
      "fileSize",
      "moduleId",
      "category",
      "sortOrder",
      "published",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Re-run extraction/transcription if fileUrl or fileType changed.
    // Runs BEFORE the update so the row writes atomically.
    const urlChanged = updateData.fileUrl !== undefined;
    const typeChanged = updateData.fileType !== undefined;
    if (urlChanged || typeChanged) {
      // Pull the row to learn the combined post-update fileUrl + fileType
      const existing = await prisma.trainingResource.findUnique({
        where: { id },
        select: { fileUrl: true, fileType: true },
      });
      const finalUrl = (updateData.fileUrl as string | undefined) ?? existing?.fileUrl ?? "";
      const finalType = (updateData.fileType as string | undefined) ?? existing?.fileType ?? "";
      if (finalType === "pdf" && finalUrl) {
        const result = await extractPdfTextFromUrl(finalUrl);
        updateData.extractedText = result.text || null;
        updateData.extractedAt = result.text ? new Date() : null;
        // clear any stale audio transcript from a prior fileType
        updateData.audioTranscript = null;
        updateData.transcribedAt = null;
      } else if (finalType === "audio" && finalUrl) {
        const result = await transcribeAudioFromUrl(finalUrl, { fileType: "audio" });
        updateData.audioTranscript = result.text || null;
        updateData.transcribedAt = result.text ? new Date() : null;
        updateData.extractedText = null;
        updateData.extractedAt = null;
      } else {
        // non-extractable type — clear both
        updateData.extractedText = null;
        updateData.extractedAt = null;
        updateData.audioTranscript = null;
        updateData.transcribedAt = null;
      }
    }

    const resource = await prisma.trainingResource.update({
      where: { id },
      data: updateData,
    });

    await bumpKnowledgeVersion().catch((e) =>
      console.error("[ai-knowledge] bumpKnowledgeVersion failed", e)
    );

    return NextResponse.json({ resource });
  } catch {
    return NextResponse.json(
      { error: "Failed to update training resource" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/training/resources/[id]
 *
 * Deletes a training resource by ID.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const id = params.id;

    await prisma.trainingResource.delete({
      where: { id },
    });

    await bumpKnowledgeVersion().catch((e) =>
      console.error("[ai-knowledge] bumpKnowledgeVersion failed", e)
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete training resource" },
      { status: 500 }
    );
  }
}
