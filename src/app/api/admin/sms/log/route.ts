import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["super_admin", "admin", "accounting", "partner_support"];

/**
 * GET /api/admin/sms/log?filter=all|unread|replied&limit=200
 *
 * Returns paginated SmsLog rows with partner name/code enrichment and a
 * computed `repliedAt` field for each outbound row. "Replied" means the
 * partner has sent at least one inbound SmsLog row AFTER this outbound's
 * createdAt. Inbound rows are always returned as-is (they ARE the replies).
 *
 * Note: Twilio SMS does NOT expose read receipts — `status` reflects
 * delivery state (sent | demo | failed | skipped_optout) only. "Unread"
 * here means "no reply received yet", not "recipient hasn't opened it".
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const filter = (url.searchParams.get("filter") || "all").toLowerCase();
  const limitRaw = parseInt(url.searchParams.get("limit") || "200", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500);

  try {
    const logs = await prisma.smsLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const partnerCodes = Array.from(
      new Set(logs.map((l) => l.partnerCode).filter((c): c is string => !!c))
    );

    const partners = partnerCodes.length
      ? await prisma.partner.findMany({
          where: { partnerCode: { in: partnerCodes } },
          select: { id: true, partnerCode: true, firstName: true, lastName: true },
        })
      : [];
    const partnerByCode = new Map(partners.map((p) => [p.partnerCode, p]));

    // Build a map of inbound timestamps per partnerCode so we can compute
    // repliedAt for each outbound row in O(outbound × inboundPerCode).
    const inboundByCode = new Map<string, Date[]>();
    for (const l of logs) {
      if (l.direction !== "inbound" || !l.partnerCode) continue;
      const arr = inboundByCode.get(l.partnerCode) || [];
      arr.push(l.createdAt);
      inboundByCode.set(l.partnerCode, arr);
    }

    const enriched = logs.map((l) => {
      const partner = l.partnerCode ? partnerByCode.get(l.partnerCode) : null;
      let repliedAt: Date | null = null;
      if (l.direction === "outbound" && l.partnerCode) {
        const inbounds = inboundByCode.get(l.partnerCode) || [];
        // Earliest inbound strictly after this outbound's createdAt.
        const candidates = inbounds.filter((t) => t.getTime() > l.createdAt.getTime());
        if (candidates.length) {
          repliedAt = new Date(Math.min(...candidates.map((t) => t.getTime())));
        }
      }
      return {
        id: l.id,
        partnerCode: l.partnerCode,
        partnerId: partner?.id || null,
        partnerName: partner ? `${partner.firstName || ""} ${partner.lastName || ""}`.trim() || partner.partnerCode : null,
        direction: l.direction,
        toPhone: l.toPhone,
        fromPhone: l.fromPhone,
        body: l.body,
        template: l.template,
        status: l.status,
        providerMessageId: l.providerMessageId,
        errorMessage: l.errorMessage,
        createdAt: l.createdAt,
        repliedAt,
      };
    });

    let filtered = enriched;
    if (filter === "replied") {
      filtered = enriched.filter((e) => e.direction === "outbound" && e.repliedAt !== null);
    } else if (filter === "unread") {
      // "Unread" = outbound rows we sent that haven't gotten a reply yet.
      // Skipped + demo still count as "unread" since no reply is possible.
      filtered = enriched.filter((e) => e.direction === "outbound" && e.repliedAt === null);
    }

    return NextResponse.json({
      logs: filtered,
      counts: {
        all: enriched.length,
        replied: enriched.filter((e) => e.direction === "outbound" && e.repliedAt !== null).length,
        unread: enriched.filter((e) => e.direction === "outbound" && e.repliedAt === null).length,
      },
    });
  } catch (e) {
    console.error("[sms/log GET] error:", e);
    return NextResponse.json({ error: "Failed to fetch SMS log" }, { status: 500 });
  }
}
