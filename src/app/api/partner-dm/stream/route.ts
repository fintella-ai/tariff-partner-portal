// src/app/api/partner-dm/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const partnerCode = (session?.user as any)?.partnerCode;
  if (!partnerCode) return new Response("Unauthorized", { status: 401 });

  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return new Response("threadId required", { status: 400 });

  // Verify caller is a participant of the thread
  const thread = await prisma.partnerDmThread.findUnique({ where: { id: threadId } });
  if (!thread) return new Response("Not found", { status: 404 });
  if (thread.participantA !== partnerCode && thread.participantB !== partnerCode) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
      try { await client.connect(); await client.query("LISTEN admin_chat_events"); }
      catch { controller.close(); return; }

      const onNotify = (msg: any) => {
        try {
          const parsed = JSON.parse(msg.payload);
          if (parsed.threadId === threadId && parsed.event?.startsWith?.("partner_dm.message.")) {
            controller.enqueue(encoder.encode(`event: ${parsed.event}\ndata: ${msg.payload}\n\n`));
          }
        } catch {}
      };
      client.on("notification", onNotify);
      const hb = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 20_000);
      req.signal.addEventListener("abort", async () => {
        clearInterval(hb);
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
