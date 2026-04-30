// src/app/api/admin/channels/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnyAdmin } from "@/lib/permissions";
import { parseSegmentRule, expandSegmentMatches } from "@/lib/channelSegments";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const channels = await prisma.announcementChannel.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { memberships: { where: { removedAt: null } }, messages: { where: { deletedAt: null } } } },
    },
  });
  return NextResponse.json({ channels });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const adminEmail = session?.user?.email;
  if (!adminEmail || !isAnyAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (role !== "super_admin" && role !== "admin" && role !== "partner_support") {
    return NextResponse.json({ error: "Role cannot create channels" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  let segmentRule: string | null = null;
  let segmentMatches: string[] = [];
  if (body.segmentRule) {
    const parsed = parseSegmentRule(body.segmentRule);
    if (!parsed.ok) return NextResponse.json({ error: `segmentRule invalid: ${parsed.error}` }, { status: 400 });
    segmentRule = body.segmentRule;
    segmentMatches = await expandSegmentMatches(parsed.value);
  }

  const manualSeed: string[] = Array.isArray(body.manualMembers) ? body.manualMembers : [];

  const channel = await prisma.$transaction(async (tx) => {
    const validModes = ["disabled", "threads", "open"];
    const replyMode = validModes.includes(body.replyMode) ? body.replyMode : "threads";
    const c = await tx.announcementChannel.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        createdByEmail: adminEmail,
        segmentRule,
        replyMode,
      },
    });
    const allToAdd = new Map<string, "manual" | "segment">();
    for (const code of segmentMatches) allToAdd.set(code, "segment");
    for (const code of manualSeed) allToAdd.set(code, "manual"); // manual overrides segment source
    if (allToAdd.size > 0) {
      await tx.channelMembership.createMany({
        data: Array.from(allToAdd.entries()).map(([partnerCode, source]) => ({
          channelId: c.id,
          partnerCode,
          source,
          addedByEmail: adminEmail,
        })),
      });
    }
    return c;
  });
  return NextResponse.json({ channel }, { status: 201 });
}
