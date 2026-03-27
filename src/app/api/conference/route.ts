import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/conference
 * Returns the active conference schedule (next call) and past recordings.
 * Requires authenticated partner session.
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
    const activeSchedule = await prisma.conferenceSchedule.findFirst({
      where: { isActive: true },
      orderBy: { nextCall: "asc" },
    });

    const pastRecordings = await prisma.conferenceSchedule.findMany({
      where: { isActive: false },
      orderBy: { nextCall: "desc" },
    });

    return NextResponse.json({ activeSchedule, pastRecordings });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch conference data" },
      { status: 500 }
    );
  }
}
