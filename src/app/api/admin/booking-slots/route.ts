import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["super_admin", "admin", "partner_support"];
const WRITE_ROLES = ["super_admin", "admin"];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ADMIN_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slots = await prisma.bookingSlot.findMany({
    orderBy: { startsAt: "asc" },
    include: {
      bookings: {
        where: { status: "confirmed" },
        select: { id: true, name: true, email: true, applicationId: true },
      },
    },
  });

  return NextResponse.json({ slots });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!WRITE_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (!startsAt || isNaN(startsAt.getTime())) return NextResponse.json({ error: "Valid startsAt required" }, { status: 400 });
  if (!endsAt || isNaN(endsAt.getTime())) return NextResponse.json({ error: "Valid endsAt required" }, { status: 400 });
  if (endsAt <= startsAt) return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 400 });

  const capacity = Number.isFinite(body.capacity) ? Math.min(5, Math.max(1, Math.floor(body.capacity))) : 1;
  const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : "google_meet";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Partner Qualification Call";
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

  const slot = await prisma.bookingSlot.create({
    data: { startsAt, endsAt, capacity, location, title, notes },
  });

  return NextResponse.json({ slot }, { status: 201 });
}
