/**
 * Admin presence helpers (PartnerOS AI Phase 3c.4a — spec §5.3).
 *
 * An admin is "online" if their User.lastHeartbeatAt is within the freshness
 * window (default 2 minutes). The client-side pinger fires every 60 seconds,
 * so a 120-second window tolerates a single missed tick (e.g. tab throttled
 * or network blip) without flipping the admin offline.
 *
 * Used by Ollie before offering:
 *   - live_chat  → need at least one assigned admin online for the inbox
 *   - live_call  → same, plus availableForLiveCall=true
 *
 * NEVER used as a security check — it's availability UX only. The actual
 * access control for admin endpoints lives in middleware + per-route role
 * gates.
 */
import { prisma } from "@/lib/prisma";

/** Default window in milliseconds — 2× the client ping interval. */
const FRESHNESS_MS = 2 * 60 * 1000;

/** True when `lastHeartbeatAt` is within the freshness window. */
export function isAdminOnline(
  lastHeartbeatAt: Date | null | undefined,
  now: Date = new Date(),
  freshnessMs: number = FRESHNESS_MS
): boolean {
  if (!lastHeartbeatAt) return false;
  return now.getTime() - lastHeartbeatAt.getTime() < freshnessMs;
}

/**
 * Return all admin users currently online. Lightweight — just id + email +
 * lastHeartbeatAt. Caller joins to whatever else they need.
 */
export async function getOnlineAdmins(
  now: Date = new Date(),
  freshnessMs: number = FRESHNESS_MS
) {
  const cutoff = new Date(now.getTime() - freshnessMs);
  return prisma.user.findMany({
    where: { lastHeartbeatAt: { gte: cutoff } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastHeartbeatAt: true,
      availableForLiveChat: true,
      availableForLiveCall: true,
    },
    orderBy: { lastHeartbeatAt: "desc" },
  });
}

/**
 * Narrow the online set to a specific inbox's assigned admins. Used by
 * Ollie's future live-chat / live-call tools (Phase 3c.4b+).
 */
export async function getOnlineAdminsForInbox(
  assignedAdminIds: string[],
  now: Date = new Date(),
  freshnessMs: number = FRESHNESS_MS
) {
  if (assignedAdminIds.length === 0) return [];
  const cutoff = new Date(now.getTime() - freshnessMs);
  return prisma.user.findMany({
    where: {
      id: { in: assignedAdminIds },
      lastHeartbeatAt: { gte: cutoff },
    },
    select: {
      id: true,
      email: true,
      name: true,
      lastHeartbeatAt: true,
      availableForLiveChat: true,
      availableForLiveCall: true,
    },
  });
}
