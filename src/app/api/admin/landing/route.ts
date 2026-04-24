import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LANDING_CONTENT, parseLandingContent } from "@/lib/landingContent";

const ADMIN_ROLES = ["super_admin", "admin"];

export const dynamic = "force-dynamic";

async function ensureLandingRow() {
  const row = await prisma.landingContent.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      draft: JSON.stringify(DEFAULT_LANDING_CONTENT),
      published: JSON.stringify(DEFAULT_LANDING_CONTENT),
    },
  });
  return row;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await ensureLandingRow();

  return NextResponse.json({
    draft: parseLandingContent(row.draft),
    published: parseLandingContent(row.published),
    landingV2Enabled: row.landingV2Enabled,
    landingV2Live: row.landingV2Live,
    lastRegeneratedAt: row.lastRegeneratedAt,
    lastPublishedAt: row.lastPublishedAt,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, any> = {};

  if (body.draft !== undefined) {
    if (typeof body.draft !== "object") return NextResponse.json({ error: "draft must be an object" }, { status: 400 });
    data.draft = JSON.stringify(body.draft);
  }
  if (typeof body.landingV2Enabled === "boolean") data.landingV2Enabled = body.landingV2Enabled;
  if (typeof body.landingV2Live === "boolean") data.landingV2Live = body.landingV2Live;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  await ensureLandingRow();
  const row = await prisma.landingContent.update({
    where: { id: "global" },
    data,
  });

  return NextResponse.json({
    draft: parseLandingContent(row.draft),
    published: parseLandingContent(row.published),
    landingV2Enabled: row.landingV2Enabled,
    landingV2Live: row.landingV2Live,
  });
}
