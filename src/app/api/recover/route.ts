import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/recover
 * Public endpoint — client-facing refund calculator form submission.
 * Does NOT create a Deal — the Deal is created by Frost Law's webhook
 * after the client submits their form. This endpoint just logs the
 * submission for admin visibility and tracks the calculator estimates.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyName, contactName, email, phone, importProducts,
      estimatedDuties, estimatedRefund, partnerCode, entryPeriod,
      htsCategory,
    } = body;

    if (!companyName?.trim() || !contactName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Company name, contact name, and email are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    // Log the submission for admin tracking (webhook log)
    await prisma.webhookRequestLog.create({
      data: {
        direction: "outgoing",
        method: "POST",
        path: "/api/recover",
        body: JSON.stringify({
          contactName, companyName, email, phone,
          importProducts, estimatedDuties, estimatedRefund,
          entryPeriod, htsCategory, partnerCode,
        }).slice(0, 10000),
        responseStatus: 200,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[api/recover] error:", err);
    return NextResponse.json({ error: "Failed to submit. Please try again." }, { status: 500 });
  }
}
