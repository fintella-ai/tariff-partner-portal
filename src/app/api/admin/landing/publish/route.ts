import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseLandingContent } from "@/lib/landingContent";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["super_admin", "admin"];

/**
 * POST /api/admin/landing/publish
 *
 * Promotes LandingContent.draft → LandingContent.published. Admin must
 * be super_admin or admin. Bumps _meta.version on published.
 */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await prisma.landingContent.findUnique({ where: { id: "global" } });
  if (!row) return NextResponse.json({ error: "No draft to publish" }, { status: 404 });

  const draft = parseLandingContent(row.draft);
  draft._meta = {
    ...draft._meta,
    version: (draft._meta?.version ?? 0) + 1,
  };

  const saved = await prisma.landingContent.update({
    where: { id: "global" },
    data: {
      published: JSON.stringify(draft),
      draft: JSON.stringify(draft),
      lastPublishedAt: new Date(),
      lastPublishedBy: (session.user as any).id ?? null,
    },
  });

  return NextResponse.json({
    success: true,
    published: parseLandingContent(saved.published),
    draft: parseLandingContent(saved.draft),
  });
}
