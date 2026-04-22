import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/twilio";

const ALLOWED_ROLES = ["super_admin", "admin"];

/**
 * POST /api/admin/sms/send
 * Body: { partnerCode: string, body: string, template?: string }
 *
 * Single-recipient ad-hoc SMS to a partner. Backend enforces TCPA via
 * sendSms — skips if Partner.smsOptIn=false. Use /api/admin/sms/bulk
 * with mode="opt_in_request" to onboard partners who haven't opted in.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.partnerCode || typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "partnerCode and body are required" }, { status: 400 });
  }
  if (body.body.length > 320) {
    return NextResponse.json({ error: "body too long (max 320 chars)" }, { status: 400 });
  }

  const partner = await prisma.partner.findUnique({
    where: { partnerCode: String(body.partnerCode).trim().toUpperCase() },
    select: { partnerCode: true, mobilePhone: true, smsOptIn: true },
  });
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  if (!partner.mobilePhone) {
    return NextResponse.json({ error: "Partner has no mobile number on file" }, { status: 400 });
  }

  const result = await sendSms({
    to: partner.mobilePhone,
    body: body.body,
    template: typeof body.template === "string" && body.template.trim() ? body.template.slice(0, 64) : "admin_adhoc",
    partnerCode: partner.partnerCode,
    optedIn: partner.smsOptIn,
  });

  return NextResponse.json({
    status: result.status,
    messageId: result.messageId,
    error: result.error,
  });
}
