import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bumpKnowledgeVersion } from "@/lib/ai-knowledge-version";

/**
 * GET /api/admin/training/modules
 *
 * Returns ALL training modules (including unpublished) for admin management.
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
    const modules = await prisma.trainingModule.findMany({
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ modules });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch training modules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/training/modules
 *
 * Creates a new training module.
 * Body: { title, description?, category, content?, videoUrl?, duration?, sortOrder?, published? }
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
      category,
      content,
      videoUrl,
      duration,
      sortOrder = 0,
      published = true,
    } = body;

    if (!title || !category) {
      return NextResponse.json(
        { error: "Title and category are required" },
        { status: 400 }
      );
    }

    const module = await prisma.trainingModule.create({
      data: {
        title,
        description: description || null,
        category,
        content: content || null,
        videoUrl: videoUrl || null,
        duration: duration || null,
        sortOrder,
        published,
      },
    });

    // Invalidate Tara's cached system prompt so the next AI request rebuilds it.
    await bumpKnowledgeVersion().catch((e) =>
      console.error("[ai-knowledge] bumpKnowledgeVersion failed", e)
    );

    return NextResponse.json({ module }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create training module" },
      { status: 500 }
    );
  }
}
