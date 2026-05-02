import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userId = session.user!.id;
    const url = req.nextUrl;
    const status = url.searchParams.get("status");
    const entityId = url.searchParams.get("entityId");
    const type = url.searchParams.get("type");

    const where: Record<string, unknown> = {
      OR: [{ requesterId: userId }, { recipientId: userId }],
    };
    if (status) where.status = status;
    if (entityId) where.entityId = entityId;
    if (type) where.type = type;

    const requests = await prisma.request.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
        _count: { select: { responses: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ requests });
  } catch (e) {
    console.error("GET /api/ops/requests error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userId = session.user!.id;
    const body = await req.json();
    const { recipientId, entityId, type, title, body: reqBody, proposedTime, dueBy, requiresApproval } = body as {
      recipientId: string;
      entityId?: string;
      type: string;
      title: string;
      body?: string;
      proposedTime?: string;
      dueBy?: string;
      requiresApproval?: boolean;
    };

    if (!recipientId || !type || !title) {
      return NextResponse.json({ error: "recipientId, type, and title are required" }, { status: 400 });
    }

    const reminders: { scheduledAt: Date }[] = [];
    const now = new Date();

    if (type === "time_bound" && proposedTime) {
      const t = new Date(proposedTime);
      const reminderTime = new Date(t.getTime() - 60 * 60 * 1000);
      if (reminderTime > now) {
        reminders.push({ scheduledAt: reminderTime });
      }
    } else if (type === "due_by" && dueBy) {
      const t = new Date(dueBy);
      const reminderTime = new Date(t.getTime() - 24 * 60 * 60 * 1000);
      if (reminderTime > now) {
        reminders.push({ scheduledAt: reminderTime });
      }
    } else if (type === "open_ended") {
      reminders.push({ scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) });
    }

    const request = await prisma.request.create({
      data: {
        requesterId: userId,
        recipientId,
        entityId: entityId || null,
        type: type as "time_bound" | "due_by" | "open_ended",
        title,
        body: reqBody || null,
        proposedTime: proposedTime ? new Date(proposedTime) : null,
        dueBy: dueBy ? new Date(dueBy) : null,
        requiresApproval: requiresApproval ?? false,
        reminders: reminders.length > 0 ? { create: reminders } : undefined,
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
        reminders: true,
      },
    });

    return NextResponse.json({ request }, { status: 201 });
  } catch (e) {
    console.error("POST /api/ops/requests error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
