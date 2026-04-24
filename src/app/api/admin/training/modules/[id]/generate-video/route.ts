import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateVideoScript } from "@/lib/ai-video";

/**
 * POST /api/admin/training/modules/[id]/generate-video
 *
 * Generates an AI video script from PDF training resources for a specific
 * training module. Stores the resulting JSON on TrainingModule.videoScript.
 *
 * Body (optional): { resourceIds?: string[] }
 * - If resourceIds provided, uses those specific resources as source material
 * - Otherwise auto-selects all published PDFs with extractedText
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const moduleId = params.id;

  try {
    const trainingModule = await prisma.trainingModule.findUnique({
      where: { id: moduleId },
    });

    if (!trainingModule) {
      return NextResponse.json(
        { error: "Training module not found" },
        { status: 404 }
      );
    }

    let body: { resourceIds?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine — auto-select resources
    }

    let resources;
    if (body.resourceIds && body.resourceIds.length > 0) {
      resources = await prisma.trainingResource.findMany({
        where: {
          id: { in: body.resourceIds },
          published: true,
          extractedText: { not: null },
        },
        select: { title: true, extractedText: true },
      });
    } else {
      // Auto-select: prefer same category, fall back to all PDFs
      const sameCategoryResources = await prisma.trainingResource.findMany({
        where: {
          published: true,
          fileType: "pdf",
          extractedText: { not: null },
          category: trainingModule.category,
        },
        select: { title: true, extractedText: true },
        orderBy: { sortOrder: "asc" },
      });

      if (sameCategoryResources.length >= 2) {
        resources = sameCategoryResources;
      } else {
        resources = await prisma.trainingResource.findMany({
          where: {
            published: true,
            fileType: "pdf",
            extractedText: { not: null },
          },
          select: { title: true, extractedText: true },
          orderBy: { sortOrder: "asc" },
        });
      }
    }

    const pdfTexts = resources
      .filter((r) => r.extractedText)
      .map((r) => ({
        title: r.title,
        text: r.extractedText!,
      }));

    const script = await generateVideoScript({
      moduleTitle: trainingModule.title,
      moduleCategory: trainingModule.category,
      moduleContent: trainingModule.content,
      pdfTexts,
    });

    await prisma.trainingModule.update({
      where: { id: moduleId },
      data: { videoScript: JSON.stringify(script) },
    });

    return NextResponse.json({ success: true, script });
  } catch (err) {
    console.error("[generate-video] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate video script" },
      { status: 500 }
    );
  }
}
