import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";
import {
  addCustomSection,
  getAllCustomSections,
  removeCustomSection,
  updateCustomSection,
} from "@/lib/page-custom-sections";

/**
 * GET /api/admin/page-custom-sections
 * Returns the full pageId → sections[] map. Readable by any admin (the
 * partner-side layout fetches it too so non-star sessions render the
 * star admin's authored sections).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const pages = await getAllCustomSections();
  return NextResponse.json({ pages });
}

/**
 * POST /api/admin/page-custom-sections
 * Body: { action: "add" | "update" | "remove", pageId, ... }
 *
 * Star-super-admin gated.
 *
 *   add    → { action, pageId, type, data?, order? }
 *   update → { action, pageId, id, data?, order? }
 *   remove → { action, pageId, id }
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

  const pageId = typeof body?.pageId === "string" ? body.pageId.trim() : "";
  if (!pageId) return NextResponse.json({ error: "pageId is required" }, { status: 400 });
  if (pageId.length > 100) return NextResponse.json({ error: "pageId too long" }, { status: 400 });

  const action = body?.action;

  if (action === "add") {
    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });
    const data = body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};
    const order = typeof body.order === "number" ? body.order : undefined;
    const pages = await addCustomSection(pageId, type, data, order);
    return NextResponse.json({ ok: true, pages });
  }

  if (action === "update") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const patch: { order?: number; data?: Record<string, unknown> } = {};
    if (typeof body.order === "number" && Number.isFinite(body.order)) patch.order = body.order;
    if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
      patch.data = body.data as Record<string, unknown>;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "order or data must be provided" }, { status: 400 });
    }
    const pages = await updateCustomSection(pageId, id, patch);
    return NextResponse.json({ ok: true, pages });
  }

  if (action === "remove") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const pages = await removeCustomSection(pageId, id);
    return NextResponse.json({ ok: true, pages });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
