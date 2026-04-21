import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/email-templates/keys
 *
 * Lightweight list of live email templates for the Automations editor's
 * "Send Email" action picker. Returns only what the dropdown needs —
 * key + name + category — for every enabled, non-draft template.
 *
 * Gated to any admin role. Workflow editing itself is super_admin only
 * (enforced by /api/admin/workflows/* routes), so a non-super_admin
 * who manages to call this learns nothing they couldn't learn by
 * opening the EmailTemplate browser in Communications.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const templates = await prisma.emailTemplate.findMany({
      where: { enabled: true, isDraft: false },
      select: { key: true, name: true, category: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}
