import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Never prerender — this route hits the DB on every request and has to
// respond with current slot availability. Static export is a footgun here.
export const dynamic = "force-dynamic";

/**
 * GET /api/booking/slots
 *
 * Public endpoint: lists future OPEN booking slots with seats remaining.
 * Used by the landing page booker step after an applicant submits the
 * intake form. Past slots, closed/canceled slots, and fully-booked slots
 * are filtered out server-side so the client never has to.
 */
export async function GET() {
  const now = new Date();

  const slots = await prisma.bookingSlot.findMany({
    where: {
      status: "open",
      startsAt: { gt: now },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      location: true,
      title: true,
      notes: true,
      bookings: {
        where: { status: "confirmed" },
        select: { id: true },
      },
    },
    take: 60,
  });

  const serialized = slots
    .map((s) => {
      const seatsTaken = s.bookings.length;
      const seatsLeft = Math.max(0, s.capacity - seatsTaken);
      return {
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        capacity: s.capacity,
        seatsTaken,
        seatsLeft,
        location: s.location,
        title: s.title,
        notes: s.notes,
      };
    })
    .filter((s) => s.seatsLeft > 0);

  return NextResponse.json({ slots: serialized });
}
