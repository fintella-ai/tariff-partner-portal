import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transcribeAudioFromUrl } from "@/lib/transcription";
import { bumpKnowledgeVersion } from "@/lib/ai-knowledge-version";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let transcribed = 0;
  let failed = 0;

  // Conference recordings
  const conferences = await prisma.conferenceSchedule.findMany({
    where: { recordingUrl: { not: null }, recordingTranscript: null },
    select: { id: true, recordingUrl: true, title: true },
  });

  for (const conf of conferences) {
    if (!conf.recordingUrl) continue;
    const result = await transcribeAudioFromUrl(conf.recordingUrl, {
      fileType: "audio",
    });
    if (result.text) {
      await prisma.conferenceSchedule.update({
        where: { id: conf.id },
        data: {
          recordingTranscript: result.text,
          recordingTranscribedAt: new Date(),
        },
      });
      transcribed++;
    } else {
      failed++;
      console.warn(
        `[transcribe-cron] Conference ${conf.id} (${conf.title}) failed:`,
        result.skippedReason
      );
    }
  }

  // Call recordings
  const calls = await prisma.callLog.findMany({
    where: { recordingUrl: { not: null }, recordingTranscript: null },
    select: { id: true, recordingUrl: true, partnerCode: true },
  });

  for (const call of calls) {
    if (!call.recordingUrl) continue;
    const result = await transcribeAudioFromUrl(call.recordingUrl, {
      fileType: "audio",
    });
    if (result.text) {
      await prisma.callLog.update({
        where: { id: call.id },
        data: {
          recordingTranscript: result.text,
          recordingTranscribedAt: new Date(),
        },
      });
      transcribed++;
    } else {
      failed++;
      console.warn(
        `[transcribe-cron] Call ${call.id} failed:`,
        result.skippedReason
      );
    }
  }

  if (transcribed > 0) {
    await bumpKnowledgeVersion();
  }

  return NextResponse.json({
    conferences: conferences.length,
    calls: calls.length,
    transcribed,
    failed,
  });
}
