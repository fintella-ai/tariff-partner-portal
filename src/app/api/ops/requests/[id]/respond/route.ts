import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent } from "@/lib/google-calendar";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const userId = session.user!.id;

    const request = await prisma.request.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
      },
    });

    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (request.requesterId !== userId && request.recipientId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { action, note, proposedTime } = body as {
      action: string;
      note?: string;
      proposedTime?: string;
    };

    if (!["accepted", "declined", "proposed_new_time", "completed"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "proposed_new_time" && !proposedTime) {
      return NextResponse.json({ error: "proposedTime required for proposed_new_time" }, { status: 400 });
    }

    const response = await prisma.requestResponse.create({
      data: {
        requestId: id,
        responderId: userId,
        action,
        note: note || null,
        proposedTime: proposedTime ? new Date(proposedTime) : null,
      },
      include: {
        responder: { select: { id: true, name: true, email: true } },
      },
    });

    const statusMap: Record<string, string> = {
      accepted: "accepted",
      declined: "declined",
      proposed_new_time: "proposed_new_time",
      completed: "completed",
    };

    const updateData: Record<string, unknown> = { status: statusMap[action] };

    if (action === "accepted" && request.type === "time_bound" && request.proposedTime) {
      const startIso = request.proposedTime.toISOString();
      const endIso = new Date(request.proposedTime.getTime() + 60 * 60 * 1000).toISOString();
      const attendeeEmails = [request.requester.email, request.recipient.email];

      const calResult = await createCalendarEvent({
        summary: request.title,
        description: request.body || undefined,
        startIso,
        endIso,
        attendeeEmails,
      });

      updateData.calEventId = calResult.id;
    }

    if (action === "proposed_new_time" && proposedTime) {
      updateData.proposedTime = new Date(proposedTime);
    }

    await prisma.request.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ response });
  } catch (e) {
    console.error("POST /api/ops/requests/[id]/respond error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
