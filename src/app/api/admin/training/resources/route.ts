import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/training/resources
 *
 * Returns ALL training resources (including unpublished) for admin management.
 * Ordered by sortOrder ascending.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const resources = await prisma.trainingResource.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ resources });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch training resources" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/training/resources
 *
 * Creates a new training resource.
 * Body: { title, description?, fileUrl, fileType, fileSize?, moduleId?, sortOrder?, published? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      title,
      description,
      fileUrl,
      fileType,
      fileSize,
      moduleId,
      category,
      sortOrder = 0,
      published = true,
    } = body;

    if (!title || !fileUrl || !fileType) {
      return NextResponse.json(
        { error: "Title, fileUrl, and fileType are required" },
        { status: 400 }
      );
    }

    const resource = await prisma.trainingResource.create({
      data: {
        title,
        description: description || null,
        fileUrl,
        fileType,
        fileSize: fileSize || null,
        moduleId: moduleId || null,
        category: category || null,
        sortOrder,
        published,
      },
    });

    return NextResponse.json({ resource }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create training resource" },
      { status: 500 }
    );
  }
}
