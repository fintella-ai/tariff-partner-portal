import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/dev/api-log
 * Returns the 100 most recent WebhookRequestLog entries for the dev panel.
 *
 * DELETE /api/admin/dev/api-log
 * Clears all log entries. Super admin only for both methods.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const logs = await prisma.webhookRequestLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      method: true,
      path: true,
      sourceIp: true,
      headers: true,
      body: true,
      responseStatus: true,
      responseBody: true,
      durationMs: true,
      error: true,
    },
  });

  return NextResponse.json({ logs });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { count } = await prisma.webhookRequestLog.deleteMany({});
  return NextResponse.json({ ok: true, deleted: count });
}
