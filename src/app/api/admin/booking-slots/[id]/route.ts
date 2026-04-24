import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteCalendarEvent } from "@/lib/google-calendar";

const WRITE_ROLES = ["super_admin", "admin"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!WRITE_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const data: Record<string, any> = {};

  if (body.startsAt) {
    const d = new Date(body.startsAt);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid startsAt" }, { status: 400 });
    data.startsAt = d;
  }
  if (body.endsAt) {
    const d = new Date(body.endsAt);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid endsAt" }, { status: 400 });
    data.endsAt = d;
  }
  if (Number.isFinite(body.capacity)) data.capacity = Math.min(5, Math.max(1, Math.floor(body.capacity)));
  if (typeof body.location === "string") data.location = body.location.trim();
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (typeof body.status === "string" && ["open", "closed", "canceled"].includes(body.status)) {
    data.status = body.status;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const slot = await prisma.bookingSlot.update({ where: { id: params.id }, data });
  return NextResponse.json({ slot });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!WRITE_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slot = await prisma.bookingSlot.findUnique({ where: { id: params.id } });
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  if (slot.googleEventId) {
    try {
      await deleteCalendarEvent(slot.googleEventId);
    } catch (err) {
      console.error("[admin/booking-slots] failed to delete calendar event", err);
    }
  }

  await prisma.bookingSlot.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
