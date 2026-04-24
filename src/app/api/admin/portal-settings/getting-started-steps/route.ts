import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET/PUT /api/admin/portal-settings/getting-started-steps
 *
 * Read + write the per-step title/description overrides for the
 * 9-step Getting-Started checklist. Stored as a JSON blob on
 * PortalSettings.gettingStartedStepOverrides.
 *
 * Shape:
 *   { [stepId]: { title?: string; description?: string } }
 *
 * Valid step IDs (keyed for validation):
 *   sign_agreement, complete_profile, add_payout, watch_video,
 *   join_call, complete_training, share_link, submit_client,
 *   invite_downline
 *
 * super_admin or admin only. Other roles fall through to 403.
 */

const VALID_STEP_IDS = [
  "sign_agreement",
  "complete_profile",
  "add_payout",
  "watch_video",
  "join_call",
  "complete_training",
  "share_link",
  "submit_client",
  "invite_downline",
] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await prisma.portalSettings.findUnique({
    where: { id: "global" },
    select: { gettingStartedStepOverrides: true },
  });

  return NextResponse.json({
    overrides: row?.gettingStartedStepOverrides ?? {},
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body as { overrides?: unknown })?.overrides;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "overrides must be an object keyed by step id" },
      { status: 400 }
    );
  }

  // Sanitize — only allow known step IDs and string title/description.
  // Empty strings are treated as "use default" by stripping them out.
  const sanitized: Record<string, { title?: string; description?: string }> = {};
  for (const id of VALID_STEP_IDS) {
    const entry = (raw as Record<string, unknown>)[id];
    if (!entry || typeof entry !== "object") continue;
    const { title, description } = entry as Record<string, unknown>;
    const out: { title?: string; description?: string } = {};
    if (typeof title === "string" && title.trim()) out.title = title.trim();
    if (typeof description === "string" && description.trim())
      out.description = description.trim();
    if (Object.keys(out).length) sanitized[id] = out;
  }

  await prisma.portalSettings.upsert({
    where: { id: "global" },
    create: { id: "global", gettingStartedStepOverrides: sanitized },
    update: { gettingStartedStepOverrides: sanitized },
  });

  return NextResponse.json({ overrides: sanitized });
}
