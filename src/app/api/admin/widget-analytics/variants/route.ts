import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/widget-analytics/variants
 * Returns all widget variants with impression counts, plus the auto-optimize flag.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [variants, settings] = await Promise.all([
    prisma.widgetVariant.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { impressions: true } } },
    }),
    prisma.portalSettings.findUnique({ where: { id: "global" }, select: { widgetAutoOptimize: true } }),
  ]);

  return NextResponse.json({ variants, autoOptimize: settings?.widgetAutoOptimize ?? false });
}

/**
 * POST /api/admin/widget-analytics/variants
 * Create a new widget variant.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, weight, config, isActive } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const variant = await prisma.widgetVariant.create({
      data: {
        name: name.toLowerCase().replace(/\s+/g, "-"),
        description: description || null,
        weight: Math.min(100, Math.max(0, weight ?? 50)),
        config: config || {},
        isActive: isActive ?? true,
      },
    });

    return NextResponse.json({ variant }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A variant with that name already exists" }, { status: 409 });
    }
    throw err;
  }
}

/**
 * PATCH /api/admin/widget-analytics/variants
 * Toggle widgetAutoOptimize in PortalSettings.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { autoOptimize } = body;

  if (typeof autoOptimize !== "boolean") {
    return NextResponse.json({ error: "autoOptimize must be a boolean" }, { status: 400 });
  }

  await prisma.portalSettings.upsert({
    where: { id: "global" },
    create: { id: "global", widgetAutoOptimize: autoOptimize },
    update: { widgetAutoOptimize: autoOptimize },
  });

  return NextResponse.json({ autoOptimize });
}

/**
 * PUT /api/admin/widget-analytics/variants
 * Update an existing widget variant.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, description, weight, config, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const variant = await prisma.widgetVariant.update({
    where: { id },
    data: {
      ...(description !== undefined && { description }),
      ...(weight !== undefined && { weight: Math.min(100, Math.max(0, weight)) }),
      ...(config !== undefined && { config }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ variant });
}
