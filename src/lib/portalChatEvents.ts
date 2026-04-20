// src/lib/portalChatEvents.ts
// Generalized SSE event bus shared by admin Team Chat and Announcement Channels.
// Publishes via Postgres pg_notify on channel `admin_chat_events` (kept so that
// the existing Team Chat SSE stream at src/app/api/admin/team-chat/stream/route.ts,
// which LISTENs on that same channel, continues to work unchanged).
import { prisma } from "@/lib/prisma";

export type PortalChatEvent =
  // Admin Team Chat events (historical names, kept for back-compat)
  | { event: "message.created"; threadId: string; messageId: string }
  | { event: "message.updated"; threadId: string; messageId: string }
  | { event: "message.deleted"; threadId: string; messageId: string }
  // Announcement channel events
  | { event: "channel.announcement.created"; channelId: string; messageId: string }
  | { event: "channel.announcement.updated"; channelId: string; messageId: string }
  | { event: "channel.announcement.deleted"; channelId: string; messageId: string }
  | { event: "channel.reply.created"; channelId: string; threadId: string; messageId: string };

/** Fire a Postgres NOTIFY so SSE subscribers see the event. Best-effort. */
export async function publishPortalChatEvent(event: PortalChatEvent): Promise<void> {
  try {
    const payload = JSON.stringify(event);
    await prisma.$executeRawUnsafe(`SELECT pg_notify('admin_chat_events', $1)`, payload);
  } catch (e) {
    console.warn("[portalChatEvents] pg_notify failed:", (e as Error).message);
  }
}
