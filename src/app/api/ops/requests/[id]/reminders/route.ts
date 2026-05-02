import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
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

    const reminders = await prisma.requestReminder.findMany({
      where: { requestId: id },
      orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json({ reminders });
  } catch (e) {
    console.error("GET /api/ops/requests/[id]/reminders error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    const { scheduledAt } = body as { scheduledAt: string };

    if (!scheduledAt) {
      return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 });
    }

    const reminder = await prisma.requestReminder.create({
      data: {
        requestId: id,
        scheduledAt: new Date(scheduledAt),
      },
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/requests/[id]/reminders error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
