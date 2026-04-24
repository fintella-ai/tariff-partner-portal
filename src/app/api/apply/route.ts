import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";

const FIELD_MAX = {
  firstName: 100,
  lastName: 100,
  email: 200,
  phone: 50,
  companyName: 200,
  website: 300,
  audienceContext: 2000,
  referralSource: 200,
};

function emailIsValid(email: string): boolean {
  // Linear-time, backtracking-free validation. Avoids the polynomial-ReDoS
  // class that any `[^\s@]+@[^\s@]+\.[^\s@]+`-shape regex is prone to
  // (CodeQL rule js/polynomial-redos). Parses the three structural parts
  // via indexOf/lastIndexOf instead of regex.
  if (email.length < 5 || email.length > FIELD_MAX.email) return false;
  const at = email.indexOf("@");
  if (at <= 0) return false;
  if (at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return false;
  const dot = domain.lastIndexOf(".");
  if (dot <= 0 || dot >= domain.length - 1) return false;
  for (let i = 0; i < email.length; i++) {
    const c = email.charCodeAt(i);
    // Reject whitespace + control characters.
    if (c <= 0x20 || c === 0x7f) return false;
  }
  return true;
}

// Lightweight IP-based rate limit: at most 5 applications from the same IP
// in a 10-minute window. Not a hard security gate (an IP can be spoofed by
// forwarded-for) — just a cheap brake on accidental double-submits and
// casual abuse. The admin can review and delete dupes anyway.
async function tooManyFromIp(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const count = await prisma.partnerApplication.count({
    where: { ipAddress: ip, createdAt: { gte: tenMinAgo } },
  });
  return count >= 5;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phoneRaw = String(body.phone ?? "").trim();
    const companyName = String(body.companyName ?? "").trim() || null;
    const website = String(body.website ?? "").trim() || null;
    const audienceContext = String(body.audienceContext ?? "").trim() || null;
    const referralSource = String(body.referralSource ?? "").trim() || null;

    if (!firstName) return NextResponse.json({ error: "First name is required" }, { status: 400 });
    if (!lastName) return NextResponse.json({ error: "Last name is required" }, { status: 400 });
    if (!emailIsValid(email)) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

    if (firstName.length > FIELD_MAX.firstName) return NextResponse.json({ error: "First name too long" }, { status: 400 });
    if (lastName.length > FIELD_MAX.lastName) return NextResponse.json({ error: "Last name too long" }, { status: 400 });
    if (companyName && companyName.length > FIELD_MAX.companyName) return NextResponse.json({ error: "Company name too long" }, { status: 400 });
    if (website && website.length > FIELD_MAX.website) return NextResponse.json({ error: "Website too long" }, { status: 400 });
    if (audienceContext && audienceContext.length > FIELD_MAX.audienceContext) return NextResponse.json({ error: "Audience details too long" }, { status: 400 });

    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;

    if (await tooManyFromIp(ip)) {
      return NextResponse.json({ error: "Too many applications from this network — please try again later or contact us directly" }, { status: 429 });
    }

    // Duplicate email guard: if a live (not-rejected) application already
    // exists for this email, don't double-create — return the existing row
    // so the applicant lands on the booker step anyway. Rejected rows
    // don't block re-apply (admin can re-qualify a previously declined
    // applicant).
    const existing = await prisma.partnerApplication.findFirst({
      where: {
        email,
        status: { not: "rejected" },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        applicationId: existing.id,
        alreadyApplied: true,
      });
    }

    // If a Partner with this email already exists, short-circuit — they
    // should log in, not apply. Don't leak whether the email matched a
    // partner; the UI treats success as success in both cases.
    const existingPartner = await prisma.partner.findFirst({ where: { email } });
    if (existingPartner) {
      return NextResponse.json({
        success: true,
        applicationId: null,
        alreadyPartner: true,
      });
    }

    const utmSource = String(body.utm_source ?? body.utmSource ?? "").trim() || null;
    const utmMedium = String(body.utm_medium ?? body.utmMedium ?? "").trim() || null;
    const utmCampaign = String(body.utm_campaign ?? body.utmCampaign ?? "").trim() || null;
    const utmContent = String(body.utm_content ?? body.utmContent ?? "").trim() || null;
    const userAgent = req.headers.get("user-agent") ?? null;

    const application = await prisma.partnerApplication.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        companyName,
        website,
        audienceContext,
        referralSource,
        // uplineCode defaults to PTNS4XDMN (John) per schema default
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        ipAddress: ip,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      applicationId: application.id,
    });
  } catch (err) {
    console.error("[api/apply] error", err);
    return NextResponse.json({ error: "Something went wrong — please try again" }, { status: 500 });
  }
}
