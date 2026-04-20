// src/app/api/admin/partner-dm-flags/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEWER_ROLES = new Set(["super_admin", "admin", "partner_support"]);

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!role || !REVIEWER_ROLES.has(role)) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
      try { await client.connect(); await client.query("LISTEN admin_chat_events"); }
      catch { controller.close(); return; }

      const onNotify = (msg: any) => {
        try {
          const parsed = JSON.parse(msg.payload);
          if (parsed.event?.startsWith?.("partner_dm.flag.")) {
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
