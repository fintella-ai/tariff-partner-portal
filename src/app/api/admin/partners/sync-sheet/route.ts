import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncAllPartners } from "@/lib/google-sheets";

/**
 * POST /api/admin/partners/sync-sheet
 * Full sync of all partners to the configured Google Sheet.
 * Requires admin role (super_admin or admin).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as unknown as { role: string }).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const count = await syncAllPartners();
    return NextResponse.json({ ok: true, count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[sync-sheet]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
