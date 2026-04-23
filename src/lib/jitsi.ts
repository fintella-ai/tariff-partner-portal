/**
 * Jitsi Meet room URL helper. Rooms don't need pre-creation — any URL
 * under https://meet.jit.si/<slug> "just works" when someone visits it.
 *
 * We derive the slug from the ConferenceSchedule id + week number so
 * it's stable per row and doesn't collide with other Fintella content.
 */

export const JITSI_BASE = "https://meet.jit.si";

export function buildJitsiSlug(row: { id: string; weekNumber: number | null }): string {
  const week = row.weekNumber != null ? `w${row.weekNumber}` : row.id.slice(-6);
  return `fintella-live-weekly-${week}-${row.id.slice(-5)}`.toLowerCase();
}

export function buildJitsiUrl(slug: string): string {
  return `${JITSI_BASE}/${slug}`;
}
