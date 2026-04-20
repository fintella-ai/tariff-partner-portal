// src/app/api/partner-dm/threads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canPartnersDm, canonicalizePair } from "@/lib/partnerDmGate";

export async function GET() {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await prisma.partnerDmThread.findMany({
    where: { OR: [{ participantA: partnerCode }, { participantB: partnerCode }] },
    orderBy: { lastMessageAt: "desc" },
    include: {
      readStates: { where: { partnerCode } },
    },
  });

  // Counterparty names for display
  const counterCodes = threads.map((t) => (t.participantA === partnerCode ? t.participantB : t.participantA));
  const partners = counterCodes.length
    ? await prisma.partner.findMany({
        where: { partnerCode: { in: counterCodes } },
        select: { partnerCode: true, firstName: true, lastName: true },
      })
    : [];
  const nameMap: Record<string, string> = {};
  for (const p of partners) nameMap[p.partnerCode] = `${p.firstName} ${p.lastName}`.trim();

  // Unread counts
  const enriched = await Promise.all(threads.map(async (t) => {
    const rs = t.readStates[0];
    const unreadCount = await prisma.partnerDmMessage.count({
      where: {
        threadId: t.id,
        deletedAt: null,
        senderPartnerCode: { not: partnerCode },
        createdAt: rs ? { gt: rs.lastReadAt } : undefined,
      },
    });
    const counterparty = t.participantA === partnerCode ? t.participantB : t.participantA;
    const { readStates: _r, ...rest } = t;
    return {
      ...rest,
      counterpartyCode: counterparty,
      counterpartyName: nameMap[counterparty] ?? counterparty,
      unreadCount,
    };
  }));

  return NextResponse.json({ threads: enriched });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const counterpartyCode = body?.counterpartyCode;
  if (!counterpartyCode || typeof counterpartyCode !== "string") {
    return NextResponse.json({ error: "counterpartyCode required" }, { status: 400 });
  }

  // Load both partners
  const [me, other] = await Promise.all([
    prisma.partner.findUnique({ where: { partnerCode } }),
    prisma.partner.findUnique({ where: { partnerCode: counterpartyCode } }),
  ]);
  if (!me || !other) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  if (!canPartnersDm(me, other)) {
    return NextResponse.json({ error: "Partners are not in a direct parent-child relationship" }, { status: 403 });
  }

  const pair = canonicalizePair(me.partnerCode, other.partnerCode);
  if (!pair) return NextResponse.json({ error: "Invalid pair" }, { status: 400 });

  const thread = await prisma.partnerDmThread.upsert({
    where: { participantA_participantB: { participantA: pair[0], participantB: pair[1] } },
    update: {},
    create: { participantA: pair[0], participantB: pair[1] },
  });
  return NextResponse.json({ thread }, { status: 201 });
}
