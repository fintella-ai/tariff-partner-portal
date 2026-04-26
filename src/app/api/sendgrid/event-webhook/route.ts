import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/engagement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/sendgrid/event-webhook
 *
 * SendGrid Event Webhook target. SendGrid POSTs a JSON array of events
 * (processed / delivered / open / click / bounce / dropped / deferred /
 * spamreport / unsubscribe) whenever one of our outbound emails reaches
 * a delivery state. We match each event to its originating EmailLog via
 * the `sg_message_id` field — the first `.`-delimited segment is the
 * SendGrid X-Message-Id we stash as EmailLog.providerMessageId.
 *
 * Template + partnerCode are denormalized onto the EmailEvent at insert
 * time so per-template engagement queries don't need a join.
 *
 * Auth: SendGrid's Signed Event Webhook uses ECDSA. When the public
 * key is configured via `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`, we verify
 * the `X-Twilio-Email-Event-Webhook-Signature` header before accepting
 * the payload. When unset, we log a warning and accept — useful for
 * first-time bootstrap before the signing key is rotated into env vars.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const publicKey = process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY;

  if (publicKey) {
    const verified = await verifySignature(req, rawBody, publicKey);
    if (!verified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[sendgrid/event-webhook] SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY not set — accepting unverified payloads. Rotate the webhook signing key into env vars to enable signature verification.");
  }

  let events: unknown;
  try {
    events = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(events)) {
    return NextResponse.json({ error: "Body must be a JSON array" }, { status: 400 });
  }

  type Evt = {
    email?: string;
    timestamp?: number;
    event?: string;
    sg_message_id?: string;
    reason?: string;
    type?: string;
    url?: string;
    useragent?: string;
    ip?: string;
  };

  let accepted = 0;
  let skipped = 0;

  // Batch-fetch all matching EmailLog rows in one query so we don't
  // N+1 when SendGrid posts 100+ events in a single batch.
  const sgIds = (events as Evt[]).map((e) => extractProviderMessageId(e.sg_message_id)).filter(Boolean) as string[];
  const logMap: Record<string, { template: string; partnerCode: string | null }> = {};
  if (sgIds.length > 0) {
    const logs = await prisma.emailLog.findMany({
      where: { providerMessageId: { in: sgIds } },
      select: { providerMessageId: true, template: true, partnerCode: true },
    });
    for (const l of logs) {
      if (l.providerMessageId) {
        logMap[l.providerMessageId] = { template: l.template, partnerCode: l.partnerCode };
      }
    }
  }

  const rows = [];
  for (const evt of events as Evt[]) {
    const providerMessageId = extractProviderMessageId(evt.sg_message_id);
    if (!providerMessageId) { skipped++; continue; }
    if (!evt.event) { skipped++; continue; }

    const matched = logMap[providerMessageId];
    rows.push({
      providerMessageId,
      sgMessageId: evt.sg_message_id ?? null,
      event: evt.event,
      email: evt.email ?? "",
      timestamp: evt.timestamp ? new Date(evt.timestamp * 1000) : new Date(),
      reason: evt.reason ?? null,
      bounceType: evt.type ?? null,
      url: evt.url ?? null,
      userAgent: evt.useragent ?? null,
      ip: evt.ip ?? null,
      template: matched?.template ?? null,
      partnerCode: matched?.partnerCode ?? null,
    });

    // Fire engagement points for partner-linked email events.
    // Fire-and-forget — never block the webhook response.
    if (matched?.partnerCode) {
      if (evt.event === "open") {
        recordActivity(matched.partnerCode, "email_open", { messageId: providerMessageId }).catch(() => {});
      } else if (evt.event === "click") {
        recordActivity(matched.partnerCode, "email_click", { url: evt.url ?? null, messageId: providerMessageId }).catch(() => {});
      }
    }

    accepted++;
  }

  if (rows.length > 0) {
    await prisma.emailEvent.createMany({ data: rows });
  }

  return NextResponse.json({ ok: true, accepted, skipped });
}

/** Extract the provider X-Message-Id from a `sg_message_id`. Format is
 * typically `{providerMessageId}.filter{XXXX}.{timestamp}.{random}`.
 */
function extractProviderMessageId(sgMessageId: string | null | undefined): string | null {
  if (!sgMessageId) return null;
  const first = sgMessageId.split(".")[0];
  return first || null;
}

/**
 * Verify the SendGrid Event Webhook signature. Uses ECDSA P-256.
 * Public key is a base64-encoded DER subjectPublicKeyInfo from the
 * SendGrid app (Settings → Mail Settings → Event Webhook → copy
 * the verification key).
 */
async function verifySignature(req: NextRequest, rawBody: string, publicKeyBase64: string): Promise<boolean> {
  const signature = req.headers.get("x-twilio-email-event-webhook-signature");
  const timestamp = req.headers.get("x-twilio-email-event-webhook-timestamp");
  if (!signature || !timestamp) return false;

  try {
    const crypto = await import("node:crypto");
    const publicKeyDer = Buffer.from(publicKeyBase64, "base64");
    const keyObject = crypto.createPublicKey({
      key: publicKeyDer,
      format: "der",
      type: "spki",
    });
    const verifier = crypto.createVerify("sha256");
    verifier.update(timestamp + rawBody);
    verifier.end();
    return verifier.verify(
      { key: keyObject, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64")
    );
  } catch (err) {
    console.error("[sendgrid/event-webhook] signature verification error:", err);
    return false;
  }
}
