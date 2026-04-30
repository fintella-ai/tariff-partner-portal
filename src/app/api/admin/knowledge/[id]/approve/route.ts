import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { approveKnowledgeEntry } from "@/lib/ai-knowledge-crud";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string | undefined;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const entry = await approveKnowledgeEntry(params.id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (err: any) {
    console.error("[admin/knowledge/approve] error:", err);
    return NextResponse.json({ error: err?.message || "Failed to approve" }, { status: 500 });
  }
}
