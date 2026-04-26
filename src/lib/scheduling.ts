/**
 * Scheduling helpers for Ollie's scheduled-call flow.
 *
 * Generates candidate slots from the inbox's `workHours` JSON
 * (falling back to Mon–Fri 9am–5pm), then subtracts Google Calendar
 * busy intervals via `freeBusyForInbox()` when the inbox has OAuth
 * connected. Timezone-aware via Intl (no deps).
 */
import { prisma } from "@/lib/prisma";
import { freeBusyForInbox } from "@/lib/google-calendar";

export interface ScheduleSlot {
  startUtc: string;
  endUtc: string;
  inboxTimeZone: string;
  durationMinutes: number;
}

type WorkHoursMap = Record<string, [string, string][]>;

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const DEFAULT_WORK_HOURS: WorkHoursMap = {
  mon: [["09:00", "17:00"]],
  tue: [["09:00", "17:00"]],
  wed: [["09:00", "17:00"]],
  thu: [["09:00", "17:00"]],
  fri: [["09:00", "17:00"]],
};

const SLOT_INTERVAL_MIN = 30;
const MAX_SLOTS = 12;

function getLocalDate(
  utcDate: Date,
  timeZone: string
): { year: number; month: number; day: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(utcDate);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    dow: dowMap[get("weekday")] ?? 0,
  };
}

function localToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, timeZone: string
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).formatToParts(guess);
    const get = (t: string) =>
      parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
    const actualH = get("hour") === 24 ? 0 : get("hour");
    const actualM = get("minute");
    const diffMin = hour * 60 + minute - (actualH * 60 + actualM);
    if (diffMin === 0) break;
    guess = new Date(guess.getTime() + diffMin * 60_000);
  }
  return guess;
}

function generateCandidateSlots(
  tz: string, duration: number, workHours: WorkHoursMap, daysAhead: number
): ScheduleSlot[] {
  const now = new Date();
  const slots: ScheduleSlot[] = [];
  const seen = new Set<string>();

  for (let d = 0; d <= daysAhead + 8 && slots.length < MAX_SLOTS; d++) {
    const probe = new Date(now.getTime() + d * 86_400_000);
    const local = getLocalDate(probe, tz);
    const dateKey = `${local.year}-${local.month}-${local.day}`;
    if (seen.has(dateKey)) continue;
    seen.add(dateKey);

    const windows = workHours[DOW_KEYS[local.dow]];
    if (!windows || windows.length === 0) continue;

    for (const [startStr, endStr] of windows) {
      const [sh, sm] = startStr.split(":").map(Number);
      const [eh, em] = endStr.split(":").map(Number);
      const wStart = sh * 60 + sm;
      const wEnd = eh * 60 + em;

      for (let m = wStart; m + duration <= wEnd && slots.length < MAX_SLOTS; m += SLOT_INTERVAL_MIN) {
        const start = localToUtc(local.year, local.month, local.day, Math.floor(m / 60), m % 60, tz);
        if (start.getTime() <= now.getTime()) continue;
        slots.push({
          startUtc: start.toISOString(),
          endUtc: new Date(start.getTime() + duration * 60_000).toISOString(),
          inboxTimeZone: tz,
          durationMinutes: duration,
        });
      }
    }
  }
  return slots;
}

export async function getOfferedSlots(
  category: string,
  daysAhead = 3
): Promise<{
  slots: ScheduleSlot[];
  inbox: {
    id: string;
    role: string;
    displayName: string;
    timeZone: string;
    callDurationMinutes: number;
    acceptScheduledCalls: boolean;
  } | null;
  reason?: string;
}> {
  const inbox =
    (await prisma.adminInbox.findFirst({
      where: { categories: { has: category } },
      select: {
        id: true,
        role: true,
        displayName: true,
        timeZone: true,
        callDurationMinutes: true,
        acceptScheduledCalls: true,
        workHours: true,
        googleCalendarRefreshToken: true,
      },
    })) ??
    (await prisma.adminInbox.findUnique({
      where: { role: "support" },
      select: {
        id: true,
        role: true,
        displayName: true,
        timeZone: true,
        callDurationMinutes: true,
        acceptScheduledCalls: true,
        workHours: true,
        googleCalendarRefreshToken: true,
      },
    }));

  if (!inbox) {
    return { slots: [], inbox: null, reason: "no_inbox_configured" };
  }
  if (!inbox.acceptScheduledCalls) {
    return {
      slots: [],
      inbox,
      reason: "inbox_not_accepting_scheduled_calls",
    };
  }

  const tz = inbox.timeZone;
  const duration = inbox.callDurationMinutes;
  const wh: WorkHoursMap =
    inbox.workHours && typeof inbox.workHours === "object"
      ? (inbox.workHours as WorkHoursMap)
      : DEFAULT_WORK_HOURS;
  const clampDays = Math.min(Math.max(1, Math.floor(daysAhead)), 14);

  const slots = generateCandidateSlots(tz, duration, wh, clampDays);

  if (inbox.googleCalendarRefreshToken && slots.length > 0) {
    const windowStart = slots[0].startUtc;
    const windowEnd = slots[slots.length - 1].endUtc;
    try {
      const busy = await freeBusyForInbox(
        inbox.googleCalendarRefreshToken,
        inbox.id,
        windowStart,
        windowEnd
      );
      if (busy && busy.length > 0) {
        const isBusy = (slot: ScheduleSlot) => {
          const slotStart = Date.parse(slot.startUtc);
          const slotEnd = Date.parse(slot.endUtc);
          return busy.some((b) => {
            const bStart = Date.parse(b.startIso);
            const bEnd = Date.parse(b.endIso);
            return slotStart < bEnd && slotEnd > bStart;
          });
        };
        return { slots: slots.filter((s) => !isBusy(s)), inbox };
      }
    } catch (e) {
      console.error("[scheduling] freeBusy failed, returning unfiltered:", e);
    }
  }

  return { slots, inbox };
}
