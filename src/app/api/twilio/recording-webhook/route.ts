import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Twilio Recording Status Webhook (Phase 15c)
 *
 * Twilio POSTs to this URL when a call recording has finished processing
 * (after the call ends). This is separate from the call-status callback
 * because the recording is processed asynchronously — the recording URL
 * isn't available until Twilio has finished encoding the audio.
 *
 * The `logId` query param is set by the voice-webhook when it builds the
 * recordingStatusCallback URL in <Dial>. This lets us update the right
 * CallLog row without a CallSid scan.
 *
 * Twilio POST fields (form-urlencoded):
 *   AccountSid, CallSid, RecordingSid, RecordingUrl, RecordingDuration,
 *   RecordingStatus ("completed" | "failed"), RecordingChannels,
 *   RecordingSource, RecordingStartTime, ErrorCode (if failed)
 *
 * Always returns 200 — Twilio retries non-200 responses.
 */
export async function POST(req: NextRequest) {
  try {
    const logIdQuery = req.nextUrl.searchParams.get("logId");
    const rawBody = await req.text();
    const usp = new URLSearchParams(rawBody);

    const callSid = usp.get("CallSid") || null;
    const recordingUrl = usp.get("RecordingUrl") || null;
    const recordingStatus = usp.get("RecordingStatus") || null;
    const recordingDuration = usp.get("RecordingDuration") || null;

    // Only update on completed recordings — skip failed/absent.
    if (recordingStatus !== "completed" || !recordingUrl) {
      console.warn(
        `[TwilioRecording] skipping status=${recordingStatus} sid=${callSid}`
      );
      return NextResponse.json({ received: true });
    }

    // Find CallLog — prefer explicit logId, fall back to CallSid.
    let logRow = null;
    if (logIdQuery) {
      logRow = await prisma.callLog
        .findUnique({ where: { id: logIdQuery } })
        .catch(() => null);
    }
    if (!logRow && callSid) {
      logRow = await prisma.callLog
        .findFirst({ where: { providerCallSid: callSid } })
        .catch(() => null);
    }

    if (!logRow) {
      console.warn(
        `[TwilioRecording] no matching CallLog for sid=${callSid} logId=${logIdQuery}`
      );
      return NextResponse.json({ received: true });
    }

    const updateData: Record<string, any> = { recordingUrl };
    if (recordingDuration && !isNaN(Number(recordingDuration))) {
      updateData.recordingDurationSeconds = Number(recordingDuration);
    }

    await prisma.callLog
      .update({ where: { id: logRow.id }, data: updateData })
      .catch((err) =>
        console.error("[TwilioRecording] failed to update CallLog:", err)
      );

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[TwilioRecording] handler threw:", err);
    return NextResponse.json({ received: true });
  }
}

// Twilio sometimes does GET probes to verify reachability.
export async function GET() {
  return NextResponse.json({ ok: true });
}
