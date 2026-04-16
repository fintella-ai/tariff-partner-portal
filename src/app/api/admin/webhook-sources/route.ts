import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function guardSuperAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || role !== "super_admin") return null;
  return session;
}

export async function GET() {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sources = await prisma.webhookSource.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  if (!await guardSuperAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, slug, description, actions, enabled } = body;

  if (!name || !slug || !actions) {
    return NextResponse.json({ error: "name, slug, and actions are required" }, { status: 400 });
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "slug must be lowercase alphanumeric with dashes only" }, { status: 400 });
  }

  // Prevent overwriting the reserved Frost Law endpoint
  if (slug === "referral") {
    return NextResponse.json({ error: "slug 'referral' is reserved" }, { status: 400 });
  }

  try {
    const source = await prisma.webhookSource.create({
      data: {
        name,
        slug,
        description: description || null,
        actions,
        enabled: enabled !== false,
      },
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "slug already exists" }, { status: 409 });
    }
    throw e;
  }
}
