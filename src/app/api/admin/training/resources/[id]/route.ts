import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const resource = await prisma.trainingResource.update({
      where: { id },
      data: updateData,
    });

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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete training resource" },
      { status: 500 }
    );
  }
}
