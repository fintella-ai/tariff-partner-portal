import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";
import { getAllOverrides, setOverride } from "@/lib/page-text-overrides";

/**
 * GET /api/admin/page-overrides
 * Returns every active override as a flat map keyed by the stable id
 * developers bake into <EditableText id="..."> wrappers.
 *
 * Readable by any authenticated admin — they need the hydrated map to
 * render pages consistently with the star admin's live edits. Enforce
 * write-side gating in POST below, not here.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const overrides = await getAllOverrides();
  return NextResponse.json({ overrides });
}

/**
 * POST /api/admin/page-overrides
 * Body: { id: string, value: string | null }
 *
 * Star-super-admin gated. value === null OR empty/whitespace reverts the
 * override (falls back to the component's hardcoded `fallback` prop).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStarSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id.length > 200) return NextResponse.json({ error: "id too long" }, { status: 400 });

  const value: string | null =
    body?.value === null || body?.value === undefined
      ? null
      : typeof body.value === "string"
      ? body.value
      : null;

  if (typeof value === "string" && value.length > 10_000) {
    return NextResponse.json({ error: "value too long" }, { status: 400 });
  }

  const overrides = await setOverride(id, value);
  return NextResponse.json({ ok: true, overrides });
}
