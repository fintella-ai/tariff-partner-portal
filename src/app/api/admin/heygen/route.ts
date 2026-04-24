import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAvatars, listVoices, isHeyGenEnabled } from "@/lib/heygen";

/**
 * GET /api/admin/heygen
 *
 * Returns available HeyGen avatars and voices for the admin to choose from.
 * Demo-gated: returns empty arrays when HEYGEN_API_KEY is unset.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isHeyGenEnabled()) {
    return NextResponse.json({
      enabled: false,
      avatars: [],
      voices: [],
    });
  }

  const [avatars, voices] = await Promise.all([listAvatars(), listVoices()]);

  return NextResponse.json({
    enabled: true,
    avatars,
    voices,
  });
}
