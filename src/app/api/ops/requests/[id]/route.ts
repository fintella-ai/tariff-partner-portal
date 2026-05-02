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

    const request = await prisma.request.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
        responses: {
          include: {
            responder: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        reminders: { orderBy: { scheduledAt: "asc" } },
      },
    });

    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (request.requesterId !== userId && request.recipientId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ request });
  } catch (e) {
    console.error("GET /api/ops/requests/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const userId = session.user!.id;

    const existing = await prisma.request.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.requesterId !== userId) {
      return NextResponse.json({ error: "Only the requester can update" }, { status: 403 });
    }

    const body = await req.json();
    const { title, body: reqBody, proposedTime, dueBy } = body as {
      title?: string;
      body?: string;
      proposedTime?: string;
      dueBy?: string;
    };

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (reqBody !== undefined) data.body = reqBody;
    if (proposedTime !== undefined) data.proposedTime = proposedTime ? new Date(proposedTime) : null;
    if (dueBy !== undefined) data.dueBy = dueBy ? new Date(dueBy) : null;

    const request = await prisma.request.update({
      where: { id },
      data,
      include: {
        requester: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ request });
  } catch (e) {
    console.error("PATCH /api/ops/requests/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const userId = session.user!.id;

    const existing = await prisma.request.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.requesterId !== userId) {
      return NextResponse.json({ error: "Only the requester can cancel" }, { status: 403 });
    }

    const request = await prisma.request.update({
      where: { id },
      data: { status: "cancelled" },
    });

    return NextResponse.json({ request });
  } catch (e) {
    console.error("DELETE /api/ops/requests/[id] error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
