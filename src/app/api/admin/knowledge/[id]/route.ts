import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateKnowledgeEntry } from "@/lib/ai-knowledge-crud";
import type { KnowledgeCategory } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string | undefined;
  if (!role || !["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entry = await prisma.knowledgeEntry.findUnique({ where: { id: params.id } });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ entry });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string | undefined;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, content, category, tags, isActive } = body as {
      title?: string;
      content?: string;
      category?: KnowledgeCategory;
      tags?: string[];
      isActive?: boolean;
    };

    const entry = await updateKnowledgeEntry(params.id, {
      title,
      content,
      category,
      tags,
      isActive,
    });

    return NextResponse.json({ entry });
  } catch (err: any) {
    console.error("[admin/knowledge] PATCH error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string | undefined;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.knowledgeEntry.update({
    where: { id: params.id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
