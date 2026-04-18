import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["super_admin", "admin", "accounting", "partner_support"];

/**
 * GET /api/admin/calls
 *
 * Returns every CallLog row across all partners so the Communications
 * Hub Phone tab can render a unified call audit (replacing the need
 * to click into each partner profile to see their calls). Joins the
 * minimal partner fields (name, company, id) so the UI can render
 * partner attribution without a second fetch.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(500, parseInt(limitParam || "200", 10) || 200);

  const calls = await prisma.callLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const partnerCodes = Array.from(
    new Set(calls.map((c) => c.partnerCode).filter(Boolean) as string[])
  );
  const partners = partnerCodes.length
    ? await prisma.partner.findMany({
        where: { partnerCode: { in: partnerCodes } },
        select: {
          id: true,
          partnerCode: true,
          firstName: true,
          lastName: true,
          companyName: true,
        },
      })
    : [];
  const partnerMap: Record<string, { id: string; name: string; company: string | null }> = {};
  for (const p of partners) {
    partnerMap[p.partnerCode] = {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim() || p.partnerCode,
      company: p.companyName,
    };
  }

  // Build phone→partner map for calls without partnerCode (legacy entries)
  const phoneMap: Record<string, { id: string; name: string; company: string | null }> = {};
  if (calls.some((c) => !c.partnerCode)) {
    const allPartners = await prisma.partner.findMany({
      select: { id: true, partnerCode: true, firstName: true, lastName: true, companyName: true, mobilePhone: true, phone: true },
    });
    for (const p of allPartners) {
      const name = `${p.firstName} ${p.lastName}`.trim() || p.partnerCode;
      const entry = { id: p.id, name, company: p.companyName };
      if (p.mobilePhone) phoneMap[p.mobilePhone] = entry;
      if (p.phone) phoneMap[p.phone] = entry;
      // Also add to partnerMap if not already there
      if (!partnerMap[p.partnerCode]) partnerMap[p.partnerCode] = entry;
    }
  }

  const enriched = calls.map((c) => {
    const byCode = c.partnerCode ? partnerMap[c.partnerCode] : null;
    const byPhone = !byCode ? phoneMap[c.toPhone] : null;
    const match = byCode || byPhone;
    return {
      ...c,
      partnerName: match?.name || null,
      partnerId: match?.id || null,
      partnerCompany: match?.company || null,
    };
  });

  const stats = {
    total: enriched.length,
    completed: enriched.filter((c) => c.status === "completed").length,
    failed: enriched.filter(
      (c) => c.status === "failed" || c.status === "no-answer" || c.status === "busy" || c.status === "canceled"
    ).length,
    totalSeconds: enriched.reduce((s, c) => s + (c.durationSeconds || 0), 0),
  };

  return NextResponse.json({ calls: enriched, stats });
}
