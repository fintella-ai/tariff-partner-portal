import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Wired system templates — every key here has a code path in src/lib/sendgrid.ts
// or src/lib/workflow-engine.ts that expects the row to exist. These can be
// EDITED via PUT (changing subject, body, from/reply-to, etc.) but cannot be
// DELETED — deleting would silently cause that code path to fall back to
// hardcoded content (for helpers that have a fallback) or fail outright (for
// workflow-engine actions that resolve the template by key at execution time).
// Drafts and admin-created custom templates can be deleted freely.
const WIRED_TEMPLATE_KEYS = new Set([
  // sendgrid.ts helpers — all consult loadTemplate and fall back to hardcoded
  "welcome",
  "agreement_ready",
  "agreement_signed",
  "signup_notification",
  "deal_status_update",
  "commission_payment_notification",
  "monthly_newsletter",
  "password_reset",
  "l1_invite",
  "partner_added_to_channel",
  // workflow-engine `email.send` actions fired from scheduled cron reminders
  // (no hardcoded fallback — deleting the row breaks the reminder flow)
  "agreement_reminder",
  "invite_reminder",
  "onboarding_nudge",
  "broker_recruitment_cold",
]);

/**
 * GET /api/admin/email-templates/[id]
 * Get a single template by id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: params.id },
    });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/email-templates/[id]
 * Update a template. All fields except `key`, `id`, and timestamps are
 * editable. Setting `key` would break the lookup in src/lib/sendgrid.ts so
 * we deliberately ignore any `key` field in the body.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  // Build a partial update from whichever fields are present in the body.
  // Deliberately do NOT honor `key` — changing it would break the lookup
  // in src/lib/sendgrid.ts at send time.
  const data: Record<string, any> = {};
  const updatableStringFields = [
    "name",
    "category",
    "subject",
    "preheader",
    "heading",
    "bodyHtml",
    "bodyText",
    "ctaLabel",
    "ctaUrl",
    "fromEmail",
    "fromName",
    "replyTo",
    "description",
    "variables",
  ];
  for (const f of updatableStringFields) {
    if (f in body) {
      const v = body[f];
      // Allow null to clear nullable fields; trim strings; reject non-string
      if (v === null) {
        data[f] = null;
      } else if (typeof v === "string") {
        data[f] = v;
      } else {
        return NextResponse.json(
          { error: `${f} must be a string or null` },
          { status: 400 }
        );
      }
    }
  }
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 }
      );
    }
    data.enabled = body.enabled;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.emailTemplate.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ template: updated });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    console.error("[email-templates PUT] error:", e);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/email-templates/[id]
 * Delete a template. Refuses to delete the four wired system templates.
 * Drafts and custom templates can be deleted freely.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const target = await prisma.emailTemplate.findUnique({
      where: { id: params.id },
    });
    if (!target) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (WIRED_TEMPLATE_KEYS.has(target.key)) {
      return NextResponse.json(
        {
          error:
            `Cannot delete the wired system template "${target.key}". Disable it instead via the enabled toggle, or edit its content. Wired templates fire from real partner events; deleting one would silently fall back to hardcoded content in src/lib/sendgrid.ts.`,
        },
        { status: 400 }
      );
    }
    await prisma.emailTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    console.error("[email-templates DELETE] error:", e);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
