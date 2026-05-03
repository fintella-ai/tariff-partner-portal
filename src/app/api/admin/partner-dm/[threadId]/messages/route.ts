import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_CODE = "ADMIN";
const MAX_CONTENT = 10_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thread = await prisma.partnerDmThread.findUnique({ where: { id: params.threadId } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.participantA !== ADMIN_CODE && thread.participantB !== ADMIN_CODE) {
    return NextResponse.json({ error: "Not an admin thread" }, { status: 403 });
  }

  const messages = await prisma.partnerDmMessage.findMany({
    where: { threadId: params.threadId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  const partnerCode = thread.participantA === ADMIN_CODE ? thread.participantB : thread.participantA;
  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { partnerCode: true, firstName: true, lastName: true, companyName: true },
  });

  return NextResponse.json({
    thread,
    messages,
    partner: partner ? {
      partnerCode: partner.partnerCode,
      name: `${partner.firstName} ${partner.lastName}`.trim(),
      company: partner.companyName,
    } : null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const content = body?.content;
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  const thread = await prisma.partnerDmThread.findUnique({ where: { id: params.threadId } });
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  if (thread.participantA !== ADMIN_CODE && thread.participantB !== ADMIN_CODE) {
    return NextResponse.json({ error: "Not an admin thread" }, { status: 403 });
  }

  const adminName = session.user.name || "Admin";
  const partnerCode = thread.participantA === ADMIN_CODE ? thread.participantB : thread.participantA;

  const msg = await prisma.$transaction(async (tx) => {
    const m = await tx.partnerDmMessage.create({
      data: {
        threadId: params.threadId,
        senderPartnerCode: ADMIN_CODE,
        content: content.trim(),
      },
    });
    await tx.partnerDmThread.update({
      where: { id: params.threadId },
      data: { lastMessageAt: new Date() },
    });
    return m;
  });

  await prisma.notification.create({
    data: {
      recipientType: "partner",
      recipientId: partnerCode,
      type: "partner_dm_message",
      title: `${adminName} from Fintella sent you a message`,
      message: content.slice(0, 100),
      link: `/dashboard/messages/${params.threadId}`,
    },
  }).catch(() => {});

  return NextResponse.json({ message: msg }, { status: 201 });
}
