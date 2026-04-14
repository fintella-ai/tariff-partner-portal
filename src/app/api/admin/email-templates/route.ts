import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/email-templates
 * Returns all EmailTemplate rows for the Communications Hub Templates tab.
 * Open to super_admin + admin (these are sender content, not partner data).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: [{ isDraft: "asc" }, { category: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ templates });
  } catch (e) {
    console.error("[email-templates GET] error:", e);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/email-templates
 * Create a new template. The Communications Hub "Create Template" button
 * uses this. Custom-created templates default to isDraft=true (since they're
 * not yet wired to any code path) and get a free-form key the admin chooses.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const required = ["key", "name", "category", "subject", "heading", "bodyHtml", "bodyText"];
  for (const f of required) {
    if (!body[f] || typeof body[f] !== "string" || !body[f].trim()) {
      return NextResponse.json(
        { error: `${f} is required` },
        { status: 400 }
      );
    }
  }

  // Validate key shape — lowercase, alphanumeric + underscore only, max 64 chars.
  // Stricter than necessary so admins don't accidentally collide with reserved
  // future system template keys via punctuation tricks.
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(body.key)) {
    return NextResponse.json(
      {
        error:
          "key must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 chars)",
      },
      { status: 400 }
    );
  }

  try {
    // Check uniqueness — return 409 with a clear message instead of letting
    // Prisma surface a P2002 constraint error
    const existing = await prisma.emailTemplate.findUnique({
      where: { key: body.key },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A template with key "${body.key}" already exists` },
        { status: 409 }
      );
    }

    const created = await prisma.emailTemplate.create({
      data: {
        key: body.key,
        name: body.name.trim(),
        category: body.category.trim(),
        subject: body.subject,
        preheader: body.preheader || null,
        heading: body.heading,
        bodyHtml: body.bodyHtml,
        bodyText: body.bodyText,
        ctaLabel: body.ctaLabel || null,
        ctaUrl: body.ctaUrl || null,
        fromEmail: body.fromEmail || null,
        fromName: body.fromName || null,
        replyTo: body.replyTo || null,
        enabled: body.enabled !== false,
        isDraft: true, // custom templates always start as draft until wired
        description: body.description || null,
        variables: body.variables || null,
      },
    });

    return NextResponse.json({ template: created }, { status: 201 });
  } catch (e) {
    console.error("[email-templates POST] error:", e);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
