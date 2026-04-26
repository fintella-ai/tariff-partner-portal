import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/engagement";

/**
 * POST /api/training/progress
 *
 * Upserts a training progress record for the authenticated partner.
 * Creates or updates based on the unique [partnerCode, moduleId] constraint.
 *
 * Body: { moduleId: string; completed: boolean }
 * Returns: the upserted TrainingProgress record
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { moduleId, completed } = body as {
      moduleId: string;
      completed: boolean;
    };

    // Validate required fields
    if (!moduleId || typeof completed !== "boolean") {
      return NextResponse.json(
        { error: "moduleId (string) and completed (boolean) are required" },
        { status: 400 }
      );
    }

    const completedAt = completed ? new Date() : null;

    const progress = await prisma.trainingProgress.upsert({
      where: {
        partnerCode_moduleId: {
          partnerCode,
          moduleId,
        },
      },
      update: {
        completed,
        completedAt,
      },
      create: {
        partnerCode,
        moduleId,
        completed,
        completedAt,
      },
    });

    // Fire the Getting-Started mark when the partner first completes ANY
    // training module. `updateOnboardingState` is idempotent — the stamped
    // timestamp only writes once. Fire-and-forget so training progress
    // writes are never blocked by the checklist update.
    if (completed) {
      import("@/lib/getting-started").then(({ updateOnboardingState }) =>
        updateOnboardingState(partnerCode, "mark_training_completed")
      ).catch(() => {});

      recordActivity(partnerCode, "training_completed", { moduleId }).catch(() => {});
    }

    return NextResponse.json(progress);
  } catch {
    return NextResponse.json(
      { error: "Failed to update training progress" },
      { status: 500 }
    );
  }
}
