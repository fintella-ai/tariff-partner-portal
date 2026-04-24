import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";
import {
  getAllSectionOverrides,
  setSectionOverride,
} from "@/lib/page-section-overrides";

/**
 * GET /api/admin/page-sections
 * Returns every active section override (visibility + order) keyed by
 * the stable <EditableSection id="..."> marker.
 *
 * Any admin can read — they need the hydrated map to render a page that
 * reflects the star admin's layout edits. Write-side gating lives in
 * POST below.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sections = await getAllSectionOverrides();
  return NextResponse.json({ sections });
}

/**
 * POST /api/admin/page-sections
 * Body: { id: string, hidden?: boolean, order?: number }
 *
 * Star-super-admin gated. Either field may be omitted — only provided
 * fields overwrite the existing entry (patch semantics). Default values
 * (hidden=false, no order) are stripped before persistence so the blob
 * stays tidy.
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

  const patch: { hidden?: boolean; order?: number } = {};
  if (typeof body.hidden === "boolean") patch.hidden = body.hidden;
  if (typeof body.order === "number" && Number.isFinite(body.order)) {
    patch.order = Math.trunc(body.order);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "hidden or order must be provided" }, { status: 400 });
  }

  const sections = await setSectionOverride(id, patch);
  return NextResponse.json({ ok: true, sections });
}
