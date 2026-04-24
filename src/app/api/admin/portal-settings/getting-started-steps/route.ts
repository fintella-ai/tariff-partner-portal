import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET/PUT /api/admin/portal-settings/getting-started-steps
 *
 * Read + write the full Getting-Started builder state:
 *   - `overrides`: per-step overrides on the built-in + custom steps
 *   - `customSteps`: admin-authored custom steps
 *   - `expectations`: markdown body shown at the top of the page
 *
 * super_admin or admin only.
 *
 * Overrides shape:
 *   { [stepId]: {
 *       title?, description?, ctaLabel?, ctaUrl?, icon?, hidden?, order?
 *     } }
 *   stepId is one of the 9 built-ins OR a custom_<slug> id present in
 *   customSteps below.
 *
 * customSteps shape:
 *   Array<{ id, title, description, ctaLabel, ctaUrl, icon?, doneWhen?, order? }>
 */

const BUILT_IN_STEP_IDS = new Set([
  "sign_agreement",
  "complete_profile",
  "add_payout",
  "watch_video",
  "join_call",
  "complete_training",
  "share_link",
  "submit_client",
  "invite_downline",
]);

function isValidStepId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    (BUILT_IN_STEP_IDS.has(id) || /^custom_[a-z0-9_-]{1,64}$/i.test(id))
  );
}

function sanitizeString(v: unknown, max = 400): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : null;
}

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
    select: {
      gettingStartedStepOverrides: true,
      gettingStartedCustomSteps: true,
      gettingStartedExpectations: true,
    },
  });

  return NextResponse.json({
    overrides: row?.gettingStartedStepOverrides ?? {},
    customSteps: row?.gettingStartedCustomSteps ?? [],
    expectations: row?.gettingStartedExpectations ?? "",
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

  const data: {
    gettingStartedStepOverrides?: unknown;
    gettingStartedCustomSteps?: unknown;
    gettingStartedExpectations?: string | null;
  } = {};

  // ── overrides ──
  const rawOverrides = (body as { overrides?: unknown })?.overrides;
  if (rawOverrides !== undefined) {
    if (
      typeof rawOverrides !== "object" ||
      rawOverrides === null ||
      Array.isArray(rawOverrides)
    ) {
      return NextResponse.json(
        { error: "overrides must be an object keyed by step id" },
        { status: 400 }
      );
    }
    const sanitized: Record<string, Record<string, unknown>> = {};
    for (const [stepId, entry] of Object.entries(
      rawOverrides as Record<string, unknown>
    )) {
      if (!isValidStepId(stepId)) continue;
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const t = sanitizeString(e.title, 120);
      if (t) out.title = t;
      const d = sanitizeString(e.description, 400);
      if (d) out.description = d;
      const cl = sanitizeString(e.ctaLabel, 60);
      if (cl) out.ctaLabel = cl;
      const cu = sanitizeString(e.ctaUrl, 400);
      if (cu) out.ctaUrl = cu;
      const ic = sanitizeString(e.icon, 120);
      if (ic) out.icon = ic;
      if (typeof e.hidden === "boolean") out.hidden = e.hidden;
      if (typeof e.order === "number" && Number.isFinite(e.order))
        out.order = Math.floor(e.order);
      if (Object.keys(out).length) sanitized[stepId] = out;
    }
    data.gettingStartedStepOverrides = sanitized;
  }

  // ── customSteps ──
  const rawCustom = (body as { customSteps?: unknown })?.customSteps;
  if (rawCustom !== undefined) {
    if (!Array.isArray(rawCustom)) {
      return NextResponse.json(
        { error: "customSteps must be an array" },
        { status: 400 }
      );
    }
    const sanitizedSteps: Array<Record<string, unknown>> = [];
    const seenIds = new Set<string>();
    for (const step of rawCustom) {
      if (!step || typeof step !== "object") continue;
      const s = step as Record<string, unknown>;
      const id = typeof s.id === "string" ? s.id.trim() : "";
      if (!/^custom_[a-z0-9_-]{1,64}$/i.test(id)) continue;
      if (seenIds.has(id)) continue; // dedupe
      seenIds.add(id);

      const title = sanitizeString(s.title, 120) ?? "";
      const description = sanitizeString(s.description, 400) ?? "";
      const ctaLabel = sanitizeString(s.ctaLabel, 60) ?? "Open";
      const ctaUrl = sanitizeString(s.ctaUrl, 400) ?? "/dashboard";
      if (!title) continue; // drop obviously-broken rows

      const icon = sanitizeString(s.icon, 120);
      const out: Record<string, unknown> = {
        id,
        title,
        description,
        ctaLabel,
        ctaUrl,
      };
      if (icon) out.icon = icon;
      if (s.doneWhen === "manual" || s.doneWhen === "never")
        out.doneWhen = s.doneWhen;
      if (typeof s.order === "number" && Number.isFinite(s.order))
        out.order = Math.floor(s.order);
      sanitizedSteps.push(out);
    }
    data.gettingStartedCustomSteps = sanitizedSteps;
  }

  // ── expectations ──
  const rawExpectations = (body as { expectations?: unknown })?.expectations;
  if (rawExpectations !== undefined) {
    if (rawExpectations === null || rawExpectations === "") {
      data.gettingStartedExpectations = null;
    } else if (typeof rawExpectations === "string") {
      data.gettingStartedExpectations = rawExpectations.slice(0, 8000);
    } else {
      return NextResponse.json(
        { error: "expectations must be a string or null" },
        { status: 400 }
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No writable fields supplied" },
      { status: 400 }
    );
  }

  // Prisma's Json input requires InputJsonValue — our sanitized shape is
  // JSON-safe at runtime but TS can't prove it structurally, so we cast.
  const updated = await prisma.portalSettings.upsert({
    where: { id: "global" },
    create: { id: "global", ...(data as Record<string, never>) },
    update: data as Record<string, never>,
    select: {
      gettingStartedStepOverrides: true,
      gettingStartedCustomSteps: true,
      gettingStartedExpectations: true,
    },
  });

  return NextResponse.json({
    overrides: updated.gettingStartedStepOverrides ?? {},
    customSteps: updated.gettingStartedCustomSteps ?? [],
    expectations: updated.gettingStartedExpectations ?? "",
  });
}
