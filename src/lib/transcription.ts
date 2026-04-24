/**
 * PartnerOS AI — OpenAI Whisper transcription helper
 *
 * Thin wrapper around OpenAI's /v1/audio/transcriptions endpoint. Follows
 * the same non-fatal contract as pdf-parse in src/lib/pdf-extraction.ts:
 * returns { text: "" } on any failure, never throws.
 *
 * Phase 2c scope — audio files (mp3, wav, m4a, etc.) up to 25MB
 * (Whisper's upload limit). Video transcription requires audio-track
 * extraction via ffmpeg which Vercel Functions cannot do natively;
 * deferred to Phase 2c.1.
 *
 * Demo-gated: if OPENAI_API_KEY is not set, returns { text: "" }
 * immediately without making any network call. Safe for local dev and
 * preview deploys without the key.
 */

export interface TranscribeResult {
  text: string;
  byteLength: number;
  /** Reason the transcription didn't happen — useful for admin surfacing. */
  skippedReason?:
    | "no_api_key"
    | "fetch_failed"
    | "too_large"
    | "unsupported_type"
    | "api_error";
}

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — Whisper's hard limit
const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";
const MODEL = process.env.OPENAI_WHISPER_MODEL || "whisper-1";

export async function transcribeAudioFromUrl(
  url: string,
  opts: { fileType?: string; filename?: string } = {}
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: "", byteLength: 0, skippedReason: "no_api_key" };
  }

  // Phase 2c scope — audio only. Video is deferred.
  if (opts.fileType && opts.fileType !== "audio") {
    return { text: "", byteLength: 0, skippedReason: "unsupported_type" };
  }

  try {
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) {
      console.warn(
        `[transcription] fetch failed for ${url}: ${fetchRes.status} ${fetchRes.statusText}`
      );
      return { text: "", byteLength: 0, skippedReason: "fetch_failed" };
    }
    const arrayBuffer = await fetchRes.arrayBuffer();
    const byteLength = arrayBuffer.byteLength;
    if (byteLength === 0) {
      return { text: "", byteLength: 0, skippedReason: "fetch_failed" };
    }
    if (byteLength > MAX_BYTES) {
      console.warn(
        `[transcription] audio too large (${byteLength} bytes > 25MB); skipping`
      );
      return { text: "", byteLength, skippedReason: "too_large" };
    }

    // Whisper expects multipart/form-data with a "file" field. Use the Web
    // FormData + Blob types available in Node 20+ / Next.js runtimes.
    const filename = opts.filename || url.split("/").pop() || "audio.mp3";
    const body = new FormData();
    body.append("file", new Blob([arrayBuffer]), filename);
    body.append("model", MODEL);
    body.append("response_format", "text");

    const apiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => "");
      console.warn(
        `[transcription] Whisper API ${apiRes.status}: ${errText.slice(0, 200)}`
      );
      return { text: "", byteLength, skippedReason: "api_error" };
    }

    const text = (await apiRes.text()).trim();
    return { text, byteLength };
  } catch (err) {
    console.warn("[transcription] unexpected failure", err);
    return { text: "", byteLength: 0, skippedReason: "api_error" };
  }
}
