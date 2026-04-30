import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhook/inbound-email
 *
 * SendGrid Inbound Parse webhook. SendGrid POSTs multipart/form-data for
 * every message received at *@inbound.fintella.partners. We parse the
 * relevant fields, resolve the sender to a Partner (if any), pull a
 * support-ticket token from plus-addressing if present, and persist the
 * row to InboundEmail so /admin/communications Inbox can render it.
 *
 * Configure in SendGrid → Settings → Inbound Parse:
 *   Host: inbound.fintella.partners
 *   URL:  https://fintella.partners/api/webhook/inbound-email
 *
 * DNS: add MX record `inbound.fintella.partners` → `mx.sendgrid.net` (10).
 *
 * No API-key auth on this route — SendGrid doesn't sign Inbound Parse.
 * Defense is: (1) the URL is secret-ish and we don't publish it, (2) we
 * drop messages with a spam score above SPAM_SCORE_CUTOFF, (3) every row
 * is queued for admin review before any outbound action.
 */

const SPAM_SCORE_CUTOFF = 5;

// Extract the name portion from an RFC 5322 "Name <addr@host>" string.
function parseFromField(from: string): { email: string; name: string | null } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1]?.trim() || null;
    return { email: m[2]!.trim().toLowerCase(), name };
  }
  return { email: from.trim().toLowerCase(), name: null };
}

// Pull a plus-addressing token from a "local+token@domain" style address.
// Used to route replies back to the right support ticket: when we email a
// partner we put a ticket id in the Reply-To as `support+tkt_<id>@...` so
// when they hit reply SendGrid delivers to that and we can re-associate.
function extractPlusToken(addr: string): string | null {
  const m = addr.toLowerCase().match(/^[^+@]+\+([^@]+)@/);
  return m ? m[1]! : null;
}

export async function POST(req: NextRequest) {
  try {
    // SendGrid sends application/x-www-form-urlencoded OR multipart/form-data.
    // Next.js App Router req.formData() handles both.
    const form = await req.formData();

    const fromRaw = String(form.get("from") || "");
    const toRaw = String(form.get("to") || "");
    const subject = String(form.get("subject") || "(no subject)");
    const text = String(form.get("text") || "");
    const html = (form.get("html") as string | null) || null;
    const headers = (form.get("headers") as string | null) || null;
    const spamScoreStr = form.get("spam_score") as string | null;
    const spamScore = spamScoreStr ? parseFloat(spamScoreStr) : null;

    // Extract Message-ID from headers for dedup
    let messageId: string | null = null;
    if (headers) {
      const midMatch = headers.match(/^Message-ID:\s*<([^>]+)>/im);
      if (midMatch) messageId = midMatch[1]!;
    }

    // Extract In-Reply-To / References for thread grouping
    let threadKey: string | null = null;
    if (headers) {
      const irt = headers.match(/^In-Reply-To:\s*<([^>]+)>/im);
      if (irt) threadKey = irt[1]!;
      else {
        const refs = headers.match(/^References:\s*<([^>]+)>/im);
        if (refs) threadKey = refs[1]!;
      }
    }

    // Drop obvious spam
    if (spamScore != null && spamScore > SPAM_SCORE_CUTOFF) {
      console.warn(
        `[inbound-email] Dropping message from ${fromRaw} with spam score ${spamScore}`
      );
      return NextResponse.json({ received: true, dropped: "spam" }, { status: 200 });
    }

    const { email: fromEmail, name: fromName } = parseFromField(fromRaw);
    const toEmail = toRaw.toLowerCase().trim();

    // Resolve partner by sender email (best-effort)
    let partnerCode: string | null = null;
    if (fromEmail) {
      const partner = await prisma.partner.findFirst({
        where: { email: fromEmail },
        select: { partnerCode: true },
      });
      if (partner) partnerCode = partner.partnerCode;
    }

    // Resolve lead + campaign for campaign reply detection
    let leadId: string | null = null;
    let campaignId: string | null = null;
    if (fromEmail && !partnerCode) {
      const lead = await prisma.partnerLead.findFirst({
        where: { email: fromEmail },
        select: { id: true },
      });
      if (lead) {
        leadId = lead.id;
        const enrollment = await prisma.campaignEnrollment.findFirst({
          where: { leadId: lead.id, status: { in: ["active", "completed"] } },
          orderBy: { enrolledAt: "desc" },
          select: { campaignId: true },
        });
        if (enrollment) campaignId = enrollment.campaignId;
      }
    }

    // Resolve support ticket from plus-addressing token
    let supportTicketId: string | null = null;
    const token = extractPlusToken(toEmail);
    if (token && token.startsWith("tkt_")) {
      const ticketId = token.slice(4);
      const ticket = await prisma.supportTicket
        .findUnique({ where: { id: ticketId }, select: { id: true } })
        .catch(() => null as { id: string } | null);
      if (ticket) supportTicketId = ticket.id;
    }

    // Idempotency via RFC Message-ID
    if (messageId) {
      const existing = await prisma.inboundEmail.findUnique({
        where: { messageId },
      });
      if (existing) {
        return NextResponse.json(
          { received: true, duplicate: true, id: existing.id },
          { status: 200 }
        );
      }
    }

    const row = await prisma.inboundEmail.create({
      data: {
        messageId,
        fromEmail,
        fromName,
        toEmail,
        subject,
        textBody: text,
        htmlBody: html,
        rawHeaders: headers,
        spamScore,
        partnerCode,
        leadId,
        campaignId,
        supportTicketId,
        threadKey,
      },
    });

    // If associated with a support ticket, append a SupportMessage so the
    // ticket conversation shows the incoming reply inline.
    if (supportTicketId) {
      await prisma.ticketMessage
        .create({
          data: {
            ticketId: supportTicketId,
            authorType: "partner",
            authorId: partnerCode || fromEmail,
            content: text || "(no content)",
          },
        })
        .catch((e) =>
          console.warn("[inbound-email] Failed to append ticket message:", e)
        );
    }

    return NextResponse.json({ received: true, id: row.id }, { status: 201 });
  } catch (err) {
    console.error("[inbound-email] Error:", err);
    return NextResponse.json(
      { error: "Inbound email processing failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    description:
      "SendGrid Inbound Parse webhook. POST here with parsed-form payload. GET is health check only.",
    expected_host: "inbound.fintella.partners",
    dns_required: "MX inbound.fintella.partners → mx.sendgrid.net (priority 10)",
  });
}
