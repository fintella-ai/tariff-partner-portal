import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewKnowledge } from "@/lib/ai-knowledge-crud";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as string | undefined;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { content, title } = (await req.json()) as { content?: string; title?: string };
    if (!content) return NextResponse.json({ error: "Content required" }, { status: 400 });

    const preview = await previewKnowledge(content, title);
    return NextResponse.json(preview);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Preview failed" }, { status: 500 });
  }
}
