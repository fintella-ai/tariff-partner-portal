import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["super_admin", "admin", "partner_support"];

/**
 * GET /api/admin/inbox
 * Returns the most recent inbound emails received via SendGrid Inbound Parse.
 * Optional query params:
 *   filter=all|unread|replied (default: all)
 *   limit=N (default: 100, max: 500)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filter = req.nextUrl.searchParams.get("filter") || "all";
  const inbox = req.nextUrl.searchParams.get("inbox") || "all";
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(500, parseInt(limitParam || "100", 10) || 100);

  const where: any = {};
  if (filter === "unread") where.read = false;
  if (filter === "replied") where.replied = true;

  // Per-inbox filter on `toEmail`. Supported values match
  // FINTELLA_INBOX_ADDRESSES in lib/constants.ts.
  const INBOX_MAP: Record<string, string> = {
    noreply: "noreply@fintella.partners",
    support: "support@fintella.partners",
    admin: "admin@fintella.partners",
    legal: "legal@fintella.partners",
    accounting: "accounting@fintella.partners",
  };
  if (inbox !== "all" && INBOX_MAP[inbox]) {
    where.toEmail = {
      contains: INBOX_MAP[inbox],
      mode: "insensitive" as const,
    };
  }

  const emails = await prisma.inboundEmail.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Per-inbox counts so the UI can render unread badges on each filter pill.
  const inboxCounts = await Promise.all(
    Object.entries(INBOX_MAP).map(async ([key, address]) => {
      const [total, unread] = await Promise.all([
        prisma.inboundEmail.count({
          where: { toEmail: { contains: address, mode: "insensitive" as const } },
        }),
        prisma.inboundEmail.count({
          where: {
            toEmail: { contains: address, mode: "insensitive" as const },
            read: false,
          },
        }),
      ]);
      return { inbox: key, total, unread };
    })
  );

  const stats = {
    total: await prisma.inboundEmail.count(),
    unread: await prisma.inboundEmail.count({ where: { read: false } }),
    replied: await prisma.inboundEmail.count({ where: { replied: true } }),
    byInbox: inboxCounts,
  };

  return NextResponse.json({ emails, stats });
}

/**
 * PATCH /api/admin/inbox
 * Mark an email as read / unread.
 * Body: { id: string, read: boolean }
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.id)
    return NextResponse.json({ error: "id required" }, { status: 400 });

  const updated = await prisma.inboundEmail.update({
    where: { id: body.id },
    data: { read: body.read ?? true },
  });

  return NextResponse.json({ email: updated });
}
