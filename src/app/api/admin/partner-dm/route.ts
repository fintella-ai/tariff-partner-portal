import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canonicalizePair } from "@/lib/partnerDmGate";

const ADMIN_CODE = "ADMIN";
const MAX_CONTENT = 10_000;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const threads = await prisma.partnerDmThread.findMany({
    where: { OR: [{ participantA: ADMIN_CODE }, { participantB: ADMIN_CODE }] },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1, where: { deletedAt: null } },
    },
  });

  const partnerCodes = threads.map((t) =>
    t.participantA === ADMIN_CODE ? t.participantB : t.participantA
  );
  const partners = partnerCodes.length
    ? await prisma.partner.findMany({
        where: { partnerCode: { in: partnerCodes } },
        select: { partnerCode: true, firstName: true, lastName: true, companyName: true },
      })
    : [];
  const nameMap: Record<string, { name: string; company: string | null }> = {};
  for (const p of partners) {
    nameMap[p.partnerCode] = {
      name: `${p.firstName} ${p.lastName}`.trim(),
      company: p.companyName,
    };
  }

  const enriched = threads.map((t) => {
    const code = t.participantA === ADMIN_CODE ? t.participantB : t.participantA;
    return {
      id: t.id,
      partnerCode: code,
      partnerName: nameMap[code]?.name ?? code,
      companyName: nameMap[code]?.company ?? null,
      lastMessageAt: t.lastMessageAt,
      lastMessage: t.messages[0]?.content?.slice(0, 100) ?? null,
      lastMessageSender: t.messages[0]?.senderPartnerCode ?? null,
    };
  });

  return NextResponse.json({ threads: enriched });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const partnerCode = body?.partnerCode;
  const content = body?.content;

  if (!partnerCode || typeof partnerCode !== "string") {
    return NextResponse.json({ error: "partnerCode required" }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { partnerCode: true, firstName: true },
  });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  const pair = canonicalizePair(ADMIN_CODE, partnerCode);
  if (!pair) return NextResponse.json({ error: "Invalid pair" }, { status: 400 });

  const thread = await prisma.partnerDmThread.upsert({
    where: { participantA_participantB: { participantA: pair[0], participantB: pair[1] } },
    update: {},
    create: { participantA: pair[0], participantB: pair[1] },
  });

  if (content && typeof content === "string" && content.trim().length > 0) {
    if (content.length > MAX_CONTENT) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const adminName = session.user.name || "Admin";

    await prisma.$transaction(async (tx) => {
      await tx.partnerDmMessage.create({
        data: {
          threadId: thread.id,
          senderPartnerCode: ADMIN_CODE,
          content: content.trim(),
        },
      });
      await tx.partnerDmThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });
    });

    await prisma.notification.create({
      data: {
        recipientType: "partner",
        recipientId: partnerCode,
        type: "partner_dm_message",
        title: `${adminName} from Fintella sent you a message`,
        message: content.slice(0, 100),
        link: `/dashboard/messages/${thread.id}`,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ thread }, { status: 201 });
}
