import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/training/progress
 *
 * Returns aggregate training progress statistics:
 * - Total unique partners who started training
 * - Per-module completion counts
 * - Average completion percentage across all partners
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Total module count (published only, since those are what partners see)
    const totalModules = await prisma.trainingModule.count({
      where: { published: true },
    });

    // All published modules for per-module stats
    const modules = await prisma.trainingModule.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true },
    });

    // All progress records
    const allProgress = await prisma.trainingProgress.findMany();

    // Unique partners who have at least one progress record
    const uniquePartners = new Set(allProgress.map((p) => p.partnerCode));
    const totalPartnersStarted = uniquePartners.size;

    // Per-module completion counts
    const completedByModule = new Map<string, number>();
    const startedByModule = new Map<string, number>();

    for (const record of allProgress) {
      // Count started
      startedByModule.set(
        record.moduleId,
        (startedByModule.get(record.moduleId) || 0) + 1
      );

      // Count completed
      if (record.completed) {
        completedByModule.set(
          record.moduleId,
          (completedByModule.get(record.moduleId) || 0) + 1
        );
      }
    }

    // Build per-module stats
    const moduleStats = modules.map((mod) => {
      const completed = completedByModule.get(mod.id) || 0;
      const started = startedByModule.get(mod.id) || 0;
      const percentage =
        totalPartnersStarted > 0
          ? Math.round((completed / totalPartnersStarted) * 100)
          : 0;

      return {
        moduleId: mod.id,
        moduleTitle: mod.title,
        started,
        completed,
        totalPartners: totalPartnersStarted,
        completionPercentage: percentage,
      };
    });

    // Average completion percentage across all modules
    const avgCompletion =
      moduleStats.length > 0
        ? Math.round(
            moduleStats.reduce((sum, m) => sum + m.completionPercentage, 0) /
              moduleStats.length
          )
        : 0;

    // Count partners who completed ALL modules
    const fullyCompleted =
      totalModules > 0
        ? Array.from(uniquePartners).filter((pc) => {
            const partnerCompleted = allProgress.filter(
              (p) => p.partnerCode === pc && p.completed
            ).length;
            return partnerCompleted >= totalModules;
          }).length
        : 0;

    return NextResponse.json({
      totalPartnersStarted,
      totalModules,
      avgCompletion,
      fullyCompleted,
      moduleStats,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch training progress" },
      { status: 500 }
    );
  }
}
