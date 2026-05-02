import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const userId = session.user!.id;

    const request = await prisma.request.findUnique({ where: { id } });
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (request.requesterId !== userId && request.recipientId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { snoozedUntil } = body as { snoozedUntil: string };

    if (!snoozedUntil) {
      return NextResponse.json({ error: "snoozedUntil is required" }, { status: 400 });
    }

    const nextReminder = await prisma.requestReminder.findFirst({
      where: {
        requestId: id,
        sentAt: null,
        isSnoozed: false,
      },
      orderBy: { scheduledAt: "asc" },
    });

    if (!nextReminder) {
      return NextResponse.json({ error: "No unsent reminder to snooze" }, { status: 404 });
    }

    const reminder = await prisma.requestReminder.update({
      where: { id: nextReminder.id },
      data: {
        isSnoozed: true,
        snoozedUntil: new Date(snoozedUntil),
      },
    });

    return NextResponse.json({ reminder });
  } catch (e) {
    console.error("POST /api/ops/requests/[id]/snooze error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
