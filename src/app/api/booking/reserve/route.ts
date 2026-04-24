import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createCalendarEvent,
  updateCalendarEvent,
} from "@/lib/google-calendar";
import { JITSI_BASE } from "@/lib/jitsi";

/**
 * POST /api/booking/reserve
 *
 * Public endpoint. Given a PartnerApplication.id and a BookingSlot.id,
 * reserves one seat in the slot for that applicant. Idempotent on
 * (applicationId, slotId) — re-posting the same pair returns the
 * existing booking rather than creating a duplicate.
 *
 * Side effects:
 *   1. Creates or updates the slot's Google Calendar event, adding the
 *      applicant as a guest (so Google sends them the invite).
 *   2. Derives a Jitsi room URL from the slot id on first booking so
 *      every applicant in the same slot gets the same join link.
 *
 * Capacity is enforced atomically inside a Prisma transaction: we re-count
 * confirmed bookings at commit time and reject if seats went full during
 * a race.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const applicationId = String(body.applicationId ?? "").trim();
    const slotId = String(body.slotId ?? "").trim();

    if (!applicationId || !slotId) {
      return NextResponse.json({ error: "applicationId and slotId are required" }, { status: 400 });
    }

    const application = await prisma.partnerApplication.findUnique({ where: { id: applicationId } });
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const slot = await prisma.bookingSlot.findUnique({
      where: { id: slotId },
      include: {
        bookings: { where: { status: "confirmed" }, select: { id: true, email: true } },
      },
    });
    if (!slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }
    if (slot.status !== "open") {
      return NextResponse.json({ error: "This slot is no longer open for booking" }, { status: 400 });
    }
    if (new Date(slot.startsAt) <= new Date()) {
      return NextResponse.json({ error: "This slot has already started" }, { status: 400 });
    }

    // Idempotency: if this application already holds a confirmed booking
    // on this slot, return it.
    const existing = await prisma.booking.findFirst({
      where: { applicationId, slotId, status: "confirmed" },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        bookingId: existing.id,
        alreadyBooked: true,
      });
    }

    if (slot.bookings.length >= slot.capacity) {
      return NextResponse.json({ error: "This slot is fully booked — please pick another" }, { status: 409 });
    }

    const booking = await prisma.$transaction(async (tx) => {
      const freshCount = await tx.booking.count({
        where: { slotId, status: "confirmed" },
      });
      if (freshCount >= slot.capacity) {
        throw new Error("SLOT_FULL");
      }
      return tx.booking.create({
        data: {
          slotId,
          applicationId,
          name: `${application.firstName} ${application.lastName}`.trim(),
          email: application.email,
          phone: application.phone,
        },
      });
    });

    // Ensure Jitsi room exists on the slot (first booking creates it).
    const jitsiRoom = slot.jitsiRoom || `fintella-qual-${slot.id.slice(-8)}`;
    const jitsiUrl = `${JITSI_BASE}/${jitsiRoom}`;

    // Build / update the Google Calendar event. All bookings on the same
    // slot attend the SAME event — we just add attendees as they book.
    const allAttendeeEmails = Array.from(
      new Set([...slot.bookings.map((b) => b.email), application.email])
    );

    const eventInput = {
      summary: `${slot.title} — ${application.firstName} ${application.lastName}${
        application.companyName ? ` (${application.companyName})` : ""
      }`,
      description: [
        `Qualification call with a prospective Fintella referral partner.`,
        ``,
        `Applicant: ${application.firstName} ${application.lastName}`,
        application.email ? `Email: ${application.email}` : null,
        application.phone ? `Phone: ${application.phone}` : null,
        application.companyName ? `Company: ${application.companyName}` : null,
        application.website ? `Website: ${application.website}` : null,
        application.audienceContext ? `\nAudience / Network:\n${application.audienceContext}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      startIso: new Date(slot.startsAt).toISOString(),
      endIso: new Date(slot.endsAt).toISOString(),
      joinUrl: jitsiUrl,
      attendeeEmails: allAttendeeEmails,
    };

    let googleEventId = slot.googleEventId ?? null;
    try {
      if (!googleEventId) {
        const evt = await createCalendarEvent(eventInput);
        googleEventId = evt.id;
      } else {
        await updateCalendarEvent(googleEventId, eventInput);
      }
    } catch (err) {
      // Never block the reservation on calendar failure — log and move on.
      // Admin can see the booking and sync manually from /admin/applications.
      console.error("[api/booking/reserve] calendar sync failed", err);
    }

    if (!slot.jitsiRoom || slot.googleEventId !== googleEventId) {
      await prisma.bookingSlot.update({
        where: { id: slot.id },
        data: {
          jitsiRoom,
          googleEventId: googleEventId ?? slot.googleEventId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      slot: {
        id: slot.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        title: slot.title,
        joinUrl: jitsiUrl,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_FULL") {
      return NextResponse.json({ error: "This slot filled up during your booking — please pick another" }, { status: 409 });
    }
    console.error("[api/booking/reserve] error", err);
    return NextResponse.json({ error: "Something went wrong — please try again" }, { status: 500 });
  }
}
