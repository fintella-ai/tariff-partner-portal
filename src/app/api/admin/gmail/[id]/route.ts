import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMessage, getThread } from "@/lib/gmail";

const ALLOWED_ROLES = ["super_admin", "admin", "partner_support"];

/**
 * GET /api/admin/gmail/[id]
 * Fetch a single Gmail message (full body) or the entire thread.
 * Query param: thread=true to fetch the full thread.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.includes((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fetchThread = req.nextUrl.searchParams.get("thread") === "true";

  try {
    if (fetchThread) {
      const messages = await getThread(params.id);
      return NextResponse.json({ thread: messages });
    }
    const message = await getMessage(params.id);
    return NextResponse.json({ message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Gmail error" }, { status: 502 });
  }
}
