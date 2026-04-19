// src/app/api/admin/team-chat/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isAnyAdmin } from "@/lib/permissions";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!isAnyAdmin(role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return new Response("threadId required", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
      try {
        await client.connect();
        await client.query("LISTEN admin_chat_events");
      } catch (e) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: "LISTEN failed" })}\n\n`));
        controller.close();
        return;
      }

      const onNotify = (msg: any) => {
        try {
          const parsed = JSON.parse(msg.payload);
          if (parsed.threadId === threadId) {
            controller.enqueue(encoder.encode(`event: ${parsed.event}\ndata: ${msg.payload}\n\n`));
          }
        } catch {}
      };
      client.on("notification", onNotify);

      // Heartbeat every 20s to keep the connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 20_000);

      // Cleanup when the client disconnects
      req.signal.addEventListener("abort", async () => {
        clearInterval(heartbeat);
        client.off("notification", onNotify);
        await client.end().catch(() => {});
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
