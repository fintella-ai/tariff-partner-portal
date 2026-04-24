import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bumpKnowledgeVersion } from "@/lib/ai-knowledge-version";

/**
 * PUT /api/admin/training/modules/[id]
 *
 * Updates an existing training module by ID.
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
      "category",
      "content",
      "videoUrl",
      "duration",
      "sortOrder",
      "published",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const module = await prisma.trainingModule.update({
      where: { id },
      data: updateData,
    });

    await bumpKnowledgeVersion().catch((e) =>
      console.error("[ai-knowledge] bumpKnowledgeVersion failed", e)
    );

    return NextResponse.json({ module });
  } catch {
    return NextResponse.json(
      { error: "Failed to update training module" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/training/modules/[id]
 *
 * Deletes a training module by ID.
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

    await prisma.trainingModule.delete({
      where: { id },
    });

    await bumpKnowledgeVersion().catch((e) =>
      console.error("[ai-knowledge] bumpKnowledgeVersion failed", e)
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete training module" },
      { status: 500 }
    );
  }
}
