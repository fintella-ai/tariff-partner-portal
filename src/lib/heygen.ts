/**
 * HeyGen Video Generation — creates AI avatar videos from training scripts.
 *
 * Demo-gated: returns null when HEYGEN_API_KEY is unset.
 * Video generation is async (~2-5 min render time). The flow:
 *   1. Admin triggers generation → we POST to HeyGen with the script
 *   2. HeyGen returns a video_id → we store it on the module
 *   3. We poll for completion → when done, store the final video_url
 */

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || "";
const HEYGEN_BASE = "https://api.heygen.com";

// Default avatar + voice — admin can override via PortalSettings later
const DEFAULT_AVATAR_ID = process.env.HEYGEN_AVATAR_ID || "Angela-inTshirt-20220820";
const DEFAULT_VOICE_ID = process.env.HEYGEN_VOICE_ID || "2d5b0e6cf36f460aa7fc47e3eee4ba54";

function headers() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Api-Key": HEYGEN_API_KEY,
  };
}

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface HeyGenVideoRequest {
  script: string;
  title?: string;
  avatarId?: string;
  voiceId?: string;
}

export interface HeyGenCreateResult {
  success: boolean;
  videoId?: string;
  error?: string;
}

export interface HeyGenStatusResult {
  status: "processing" | "completed" | "failed" | "pending";
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
}

export interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url: string;
  preview_video_url: string;
}

export interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio: string;
}

// ─── API FUNCTIONS ──────────────────────────────────────────────────────────

export function isHeyGenEnabled(): boolean {
  return !!HEYGEN_API_KEY;
}

/**
 * Create an avatar video from a text script.
 * HeyGen renders the video asynchronously — use checkVideoStatus to poll.
 */
export async function createAvatarVideo(
  opts: HeyGenVideoRequest
): Promise<HeyGenCreateResult> {
  if (!HEYGEN_API_KEY) {
    return { success: false, error: "HEYGEN_API_KEY not set" };
  }

  const avatarId = opts.avatarId || DEFAULT_AVATAR_ID;
  const voiceId = opts.voiceId || DEFAULT_VOICE_ID;

  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: "avatar",
              avatar_id: avatarId,
              avatar_style: "normal",
            },
            voice: {
              type: "text",
              input_text: opts.script,
              voice_id: voiceId,
              speed: 1.0,
            },
            background: {
              type: "color",
              value: "#0f1c3f",
            },
          },
        ],
        dimension: {
          width: 1920,
          height: 1080,
        },
        title: opts.title || "Training Video",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[heygen] create video ${res.status}: ${errText.slice(0, 300)}`);
      return {
        success: false,
        error: `HeyGen API error: ${res.status}`,
      };
    }

    const data = await res.json();
    const videoId = data?.data?.video_id;

    if (!videoId) {
      console.error("[heygen] no video_id in response:", JSON.stringify(data).slice(0, 300));
      return { success: false, error: "No video_id returned" };
    }

    return { success: true, videoId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[heygen] createAvatarVideo error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Check the status of a video being rendered.
 * Returns "processing" while rendering, "completed" with the video_url when done.
 */
export async function checkVideoStatus(
  videoId: string
): Promise<HeyGenStatusResult> {
  if (!HEYGEN_API_KEY) {
    return { status: "failed", error: "HEYGEN_API_KEY not set" };
  }

  try {
    const res = await fetch(
      `${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      { headers: headers() }
    );

    if (!res.ok) {
      return { status: "failed", error: `Status check failed: ${res.status}` };
    }

    const data = await res.json();
    const status = data?.data?.status;

    if (status === "completed") {
      return {
        status: "completed",
        videoUrl: data.data.video_url,
        thumbnailUrl: data.data.thumbnail_url,
        duration: data.data.duration,
      };
    }

    if (status === "failed" || status === "error") {
      return {
        status: "failed",
        error: data.data?.error || "Video generation failed",
      };
    }

    return { status: "processing" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", error: msg };
  }
}

/**
 * Poll for video completion with exponential backoff.
 * Checks every 15s for up to 10 minutes.
 */
export async function waitForVideo(
  videoId: string,
  maxWaitMs: number = 600_000
): Promise<HeyGenStatusResult> {
  const startTime = Date.now();
  let delay = 15_000;

  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkVideoStatus(videoId);

    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.2, 30_000);
  }

  return { status: "failed", error: "Timed out waiting for video" };
}

/**
 * List available avatars from HeyGen.
 */
export async function listAvatars(): Promise<HeyGenAvatar[]> {
  if (!HEYGEN_API_KEY) return [];

  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.avatars || [];
  } catch {
    return [];
  }
}

/**
 * List available voices from HeyGen.
 */
export async function listVoices(): Promise<HeyGenVoice[]> {
  if (!HEYGEN_API_KEY) return [];

  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/voices`, {
      headers: headers(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data?.voices || [];
  } catch {
    return [];
  }
}

/**
 * Convert a VideoScript (from ai-video.ts) into a single narration script
 * suitable for HeyGen. Joins all scene narrations with natural pauses.
 */
export function scriptToNarration(scenes: { narration: string }[]): string {
  return scenes
    .map((s) => s.narration.trim())
    .filter(Boolean)
    .join("\n\n");
}
