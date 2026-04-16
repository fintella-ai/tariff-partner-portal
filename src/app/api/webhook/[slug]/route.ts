import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeSourceActions, type WorkflowAction } from "@/lib/workflow-engine";

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;

  // Look up the WebhookSource
  const source = await prisma.webhookSource.findUnique({ where: { slug } });

  if (!source || !source.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate API key from x-api-key header
  const providedKey = req.headers.get("x-api-key") || "";
  if (providedKey !== source.apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request body
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    // empty or non-JSON body — treat as empty payload
  }

  // Execute configured actions
  const { actionsRun, status } = await executeSourceActions(
    source.actions as unknown as WorkflowAction[],
    { ...payload, _source: { slug: source.slug, name: source.name } }
  );

  // Update requestCount + lastHitAt (fire-and-forget)
  prisma.webhookSource.update({
    where: { id: source.id },
    data: { requestCount: { increment: 1 }, lastHitAt: new Date() },
  }).catch((e) => console.error("[webhook-source] update failed:", e));

  return NextResponse.json({
    ok: true,
    status,
    actionsRun,
  });
}
