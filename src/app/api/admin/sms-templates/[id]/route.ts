import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EDIT_ROLES = ["super_admin", "admin"];

/**
 * PUT /api/admin/sms-templates/[id]
 * Update an SMS template (body, enabled, category, name, description, variables).
 * Never changes `key` — it's a stable identifier used by twilio.ts lookup.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const data: Record<string, any> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.category === "string") data.category = body.category.trim();
  if (typeof body.body === "string") data.body = body.body;
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.isDraft === "boolean") data.isDraft = body.isDraft;
  if (typeof body.description === "string" || body.description === null) {
    data.description = body.description;
  }
  if (typeof body.variables === "string" || body.variables === null) {
    data.variables = body.variables;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields in body" }, { status: 400 });
  }

  try {
    const template = await prisma.smsTemplate.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ template });
  } catch (e) {
    console.error("[sms-templates PUT] error:", e);
    return NextResponse.json({ error: "Failed to update SMS template" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/sms-templates/[id]
 * Delete a template row. Seeded rows (welcome, agreement_ready, etc.) get
 * re-created on next build by scripts/seed-all.js since upsert.create
 * fires when they don't exist, so admin can safely delete a seeded row
 * to reset it to the seeded body.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.smsTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[sms-templates DELETE] error:", e);
    return NextResponse.json({ error: "Failed to delete SMS template" }, { status: 500 });
  }
}
