import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/training/modules
 *
 * Fetches all published training modules with the authenticated partner's
 * completion status merged onto each module record.
 *
 * Returns: { modules: Array<TrainingModule & { completed: boolean; completedAt: Date | null }> }
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
    // Fetch all published modules ordered by sortOrder
    const modules = await prisma.trainingModule.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
    });

    // Fetch this partner's progress records for all modules
    const progressRecords = await prisma.trainingProgress.findMany({
      where: { partnerCode },
    });

    // Build a lookup map: moduleId -> progress record
    const progressMap = new Map(
      progressRecords.map((p) => [p.moduleId, p])
    );

    // Merge completion status onto each module
    const modulesWithProgress = modules.map((mod) => {
      const progress = progressMap.get(mod.id);
      return {
        ...mod,
        completed: progress?.completed ?? false,
        completedAt: progress?.completedAt ?? null,
      };
    });

    return NextResponse.json({ modules: modulesWithProgress });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch training modules" },
      { status: 500 }
    );
  }
}
