import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSms, sendOptInRequestSms } from "@/lib/twilio";

const ALLOWED_ROLES = ["super_admin", "admin"];

/**
 * POST /api/admin/sms/bulk
 * Body: {
 *   mode: "opt_in_request" | "to_opted_in"
 *   body?: string          // required for mode="to_opted_in"
 *   partnerCodes?: string[] // optional narrow list; defaults to all eligible
 * }
 *
 * Two modes:
 *   - `opt_in_request` — fan-outs the templated opt-in request to every
 *     partner we *could* reach (mobile present, smsOptIn=false, not
 *     blocked, never replied STOP). Uses sendOptInRequestSms which
 *     bypasses the TCPA gate because the SMS IS the opt-in request.
 *   - `to_opted_in` — sends a free-form body to every partner with
 *     smsOptIn=true (and mobile present, not blocked). Honors TCPA via
 *     the standard sendSms opt-in check.
 *
 * Returns per-partner status so the UI can render a recipients summary.
 * Always resolves — per-recipient failures don't abort the batch.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ALLOWED_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || (body.mode !== "opt_in_request" && body.mode !== "to_opted_in")) {
    return NextResponse.json({ error: "mode must be opt_in_request or to_opted_in" }, { status: 400 });
  }

  const narrow: string[] | undefined = Array.isArray(body.partnerCodes) ? body.partnerCodes : undefined;

  if (body.mode === "to_opted_in") {
    const msg = typeof body.body === "string" ? body.body.trim() : "";
    if (!msg) return NextResponse.json({ error: "body is required for to_opted_in sends" }, { status: 400 });
    if (msg.length > 320) return NextResponse.json({ error: "body too long (max 320 chars)" }, { status: 400 });

    const partners = await prisma.partner.findMany({
      where: {
        smsOptIn: true,
        mobilePhone: { not: null },
        status: { not: "blocked" },
        ...(narrow ? { partnerCode: { in: narrow } } : {}),
      },
      select: { partnerCode: true, mobilePhone: true, smsOptIn: true },
    });

    const results = [];
    for (const p of partners) {
      if (!p.mobilePhone) continue;
      const res = await sendSms({
        to: p.mobilePhone,
        body: msg,
        template: "bulk_admin",
        partnerCode: p.partnerCode,
        optedIn: true,
      });
      results.push({ partnerCode: p.partnerCode, status: res.status });
    }
    return NextResponse.json({ sent: results.length, results });
  }

  // mode === "opt_in_request"
  // Eligible = mobile present, smsOptIn=false, not blocked, never STOPed.
  const [candidates, stopRows] = await Promise.all([
    prisma.partner.findMany({
      where: {
        mobilePhone: { not: null },
        smsOptIn: false,
        status: { not: "blocked" },
        ...(narrow ? { partnerCode: { in: narrow } } : {}),
      },
      select: {
        partnerCode: true,
        mobilePhone: true,
        firstName: true,
        lastName: true,
        smsOptIn: true,
      },
    }),
    prisma.smsLog.findMany({
      where: { template: "stop_keyword", direction: "inbound" },
      distinct: ["partnerCode"],
      select: { partnerCode: true },
    }),
  ]);

  const stopSet = new Set(stopRows.map((r) => r.partnerCode).filter(Boolean) as string[]);
  const results = [];
  for (const p of candidates) {
    if (stopSet.has(p.partnerCode)) {
      results.push({ partnerCode: p.partnerCode, status: "skipped_stop" });
      continue;
    }
    const res = await sendOptInRequestSms({
      partnerCode: p.partnerCode,
      mobilePhone: p.mobilePhone!,
      smsOptIn: p.smsOptIn,
      firstName: p.firstName,
      lastName: p.lastName,
    });
    results.push({ partnerCode: p.partnerCode, status: res.status });
  }
  return NextResponse.json({ sent: results.length, results });
}
