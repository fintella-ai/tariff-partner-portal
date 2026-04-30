import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addKnowledgeEntry } from "@/lib/ai-knowledge-crud";
import type { KnowledgeCategory, KnowledgeSourceType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string | undefined;
  if (!role || !["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get("category") as KnowledgeCategory | null;
  const sourceType = url.searchParams.get("sourceType") as KnowledgeSourceType | null;
  const approved = url.searchParams.get("approved");
  const search = url.searchParams.get("search");
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  const where: any = { isActive: true };
  if (category) where.category = category;
  if (sourceType) where.sourceType = sourceType;
  if (approved === "true") where.isApproved = true;
  if (approved === "false") where.isApproved = false;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
      { tags: { has: search.toLowerCase() } },
    ];
  }

  const [entries, total] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        summary: true,
        category: true,
        source: true,
        sourceType: true,
        tags: true,
        isApproved: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.knowledgeEntry.count({ where }),
  ]);

  return NextResponse.json({ entries, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string | undefined;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, content, category, source } = body as {
      title?: string;
      content?: string;
      category?: KnowledgeCategory;
      source?: string;
    };

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    const entry = await addKnowledgeEntry({
      title,
      content,
      category,
      source,
      sourceType: "ADMIN_PASTE",
      createdBy: session.user.email || undefined,
      autoApprove: true,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err: any) {
    console.error("[admin/knowledge] POST error:", err);
    return NextResponse.json({ error: err?.message || "Failed to create entry" }, { status: 500 });
  }
}
