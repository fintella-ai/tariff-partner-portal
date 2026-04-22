import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EDIT_ROLES = ["super_admin", "admin"];
const READ_ROLES = ["super_admin", "admin", "accounting", "partner_support"];

/**
 * GET /api/admin/sms-templates
 * List every SmsTemplate row for the Communications Hub → SMS → Templates tab.
 * Read-open to all admin roles (read-only content); mutation is super_admin/admin only.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!READ_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const templates = await prisma.smsTemplate.findMany({
      orderBy: [{ isDraft: "asc" }, { category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ templates });
  } catch (e) {
    console.error("[sms-templates GET] error:", e);
    return NextResponse.json({ error: "Failed to fetch SMS templates" }, { status: 500 });
  }
}

/**
 * POST /api/admin/sms-templates
 * Create a new SMS template. Custom-created templates default to isDraft=true
 * until an admin wires them to a send path. New rows always start enabled=false.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!EDIT_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  for (const f of ["key", "name", "category", "body"]) {
    if (!body[f] || typeof body[f] !== "string" || !body[f].trim()) {
      return NextResponse.json({ error: `${f} is required` }, { status: 400 });
    }
  }

  if (!/^[a-z][a-z0-9_]{0,63}$/.test(body.key)) {
    return NextResponse.json({
      error: "key must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 chars)",
    }, { status: 400 });
  }

  try {
    const existing = await prisma.smsTemplate.findUnique({ where: { key: body.key } });
    if (existing) {
      return NextResponse.json({ error: `A template with key "${body.key}" already exists` }, { status: 409 });
    }

    const created = await prisma.smsTemplate.create({
      data: {
        key: body.key,
        name: body.name.trim(),
        category: body.category.trim(),
        body: body.body,
        enabled: false, // always start disabled; admin enables after A2P/testing
        isDraft: true,
        description: body.description || null,
        variables: body.variables || null,
      },
    });

    return NextResponse.json({ template: created }, { status: 201 });
  } catch (e) {
    console.error("[sms-templates POST] error:", e);
    return NextResponse.json({ error: "Failed to create SMS template" }, { status: 500 });
  }
}
