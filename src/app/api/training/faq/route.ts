import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/training/faq
 *
 * Fetches all published FAQ records ordered by sortOrder.
 * Requires an authenticated partner session.
 *
 * Returns: { faqs: FAQ[] }
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    const faqs = await prisma.fAQ.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ faqs });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch FAQs" },
      { status: 500 }
    );
  }
}
