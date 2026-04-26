import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createAvatarVideo,
  waitForVideo,
  scriptToNarration,
  isHeyGenEnabled,
} from "@/lib/heygen";
import { generateVideoScript } from "@/lib/ai-video";

/**
 * POST /api/admin/getting-started/generate-heygen
 *
 * Generates a HeyGen avatar video for a Getting Started onboarding step.
 * Flow: generate script from step title+description via Claude ->
 * send narration to HeyGen -> poll for completion -> return the video URL.
 *
 * Body: { stepId: string, title: string, description?: string, avatarId?: string, voiceId?: string }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["super_admin", "admin"].includes((session.user as any).role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (!isHeyGenEnabled()) {
    return NextResponse.json(
      { error: "HEYGEN_API_KEY not configured. Add it to your environment variables." },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const { stepId, title, description, avatarId, voiceId } = body as {
      stepId: string;
      title: string;
      description?: string;
      avatarId?: string;
      voiceId?: string;
    };

    if (!stepId || !title) {
      return NextResponse.json({ error: "stepId and title are required" }, { status: 400 });
    }

    // Generate script from the step content using Claude
    const script = await generateVideoScript({
      moduleTitle: title,
      moduleCategory: "onboarding",
      moduleContent: description || null,
      pdfTexts: [],
      targetDurationMin: 1,
    });

    // Convert scene narrations into a single narration string
    const narration = scriptToNarration(script.scenes);

    // Create the video via HeyGen
    const createResult = await createAvatarVideo({
      script: narration,
      title: `Getting Started — ${title}`,
      avatarId,
      voiceId,
    });

    if (!createResult.success || !createResult.videoId) {
      return NextResponse.json(
        { error: createResult.error || "Failed to create HeyGen video" },
        { status: 500 }
      );
    }

    // Poll for completion (up to 5 min)
    const videoResult = await waitForVideo(createResult.videoId, 300_000);

    if (videoResult.status === "completed" && videoResult.videoUrl) {
      return NextResponse.json({
        success: true,
        stepId,
        videoUrl: videoResult.videoUrl,
        duration: videoResult.duration,
      });
    }

    return NextResponse.json(
      {
        error: videoResult.error || "Video is still rendering. Check back in a few minutes.",
        videoId: createResult.videoId,
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[getting-started/generate-heygen] Error:", msg);
    return NextResponse.json({ error: "Failed to generate HeyGen video" }, { status: 500 });
  }
}
