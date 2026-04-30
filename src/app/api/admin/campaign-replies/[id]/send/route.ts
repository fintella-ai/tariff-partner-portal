import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/sendgrid";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const replyText = body.reply as string;

  if (!replyText?.trim()) {
    return NextResponse.json({ error: "Reply text required" }, { status: 400 });
  }

  const email = await prisma.inboundEmail.findUnique({ where: { id: params.id } });
  if (!email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const subject = email.subject.startsWith("Re:")
    ? email.subject
    : `Re: ${email.subject}`;

  const { html, text } = emailShell({
    heading: subject,
    bodyHtml: replyText.split("\n").map((line) => `<p>${line || "&nbsp;"}</p>`).join(""),
    bodyText: replyText,
    ctaLabel: "Try Our Free Calculator",
    ctaUrl: "https://fintella.partners/calculator",
  });

  const result = await sendEmail({
    to: email.fromEmail,
    toName: email.fromName || undefined,
    subject,
    html,
    text,
    template: "campaign_reply",
    replyTo: "outreach@fintella.partners",
  });

  await prisma.inboundEmail.update({
    where: { id: params.id },
    data: {
      replied: true,
      sentReply: replyText,
      sentReplyAt: new Date(),
      read: true,
    },
  });

  if (email.leadId) {
    await prisma.partnerLead.update({
      where: { id: email.leadId },
      data: { status: "needs_review" },
    }).catch(() => {});
  }

  return NextResponse.json({ sent: result.status, messageId: result.messageId });
}
