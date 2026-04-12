import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/documents/list
 * Returns all documents across all partners with partner names.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Get partner names
    const partnerCodes = Array.from(new Set(documents.map((d: any) => d.partnerCode)));
    const partners = await prisma.partner.findMany({
      where: { partnerCode: { in: partnerCodes } },
      select: { id: true, partnerCode: true, firstName: true, lastName: true },
    });

    const infoMap: Record<string, { name: string; id: string }> = {};
    partners.forEach((p: any) => {
      infoMap[p.partnerCode] = { name: `${p.firstName} ${p.lastName}`, id: p.id };
    });

    const enriched = documents.map((d: any) => ({
      ...d,
      partnerName: infoMap[d.partnerCode]?.name || d.partnerCode,
      partnerId: infoMap[d.partnerCode]?.id || null,
    }));

    return NextResponse.json({ documents: enriched });
  } catch {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}
