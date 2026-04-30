import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWidgetJwt, getCorsHeaders } from "@/lib/widget-auth";
import { checkWidgetRateLimit } from "@/lib/widget-rate-limit";
import {
  lookupCombinedRate,
  calculateIeepaDuty,
  calculateInterest,
  checkEligibility,
  type RateRecord,
  type QuarterlyRate,
} from "@/lib/tariff-calculator";

// IEEPA termination date — duties after this date are not refundable
const IEEPA_TERMINATION = new Date("2026-02-24T00:00:00Z");

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get("origin"), null),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin, null);

  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
  }

  const payload = verifyWidgetJwt(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401, headers: cors });
  }

  const { sid: sessionId } = payload;

  const session = await prisma.widgetSession.findUnique({
    where: { id: sessionId },
    select: { apiKeyHint: true, isActive: true },
  });
  if (!session?.isActive) {
    return NextResponse.json({ error: "Session deactivated" }, { status: 401, headers: cors });
  }

  const rateCheck = checkWidgetRateLimit(session.apiKeyHint);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rateCheck.retryAfterMs },
      {
        status: 429,
        headers: {
          ...cors,
          "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)),
        },
      }
    );
  }

  try {
    const body = await req.json();
    const { countryOfOrigin, entryDate, enteredValue } = body;

    // Validate required fields
    if (!countryOfOrigin || !entryDate || enteredValue == null) {
      return NextResponse.json(
        { error: "countryOfOrigin, entryDate, and enteredValue are required" },
        { status: 400, headers: cors }
      );
    }

    const parsedDate = new Date(entryDate);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid entryDate format" },
        { status: 400, headers: cors }
      );
    }

    const numericValue = Number(enteredValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      return NextResponse.json(
        { error: "enteredValue must be a positive number" },
        { status: 400, headers: cors }
      );
    }

    const countryCode = countryOfOrigin.toUpperCase();

    // Load matching IEEPA rates for this country + date
    const allRates = await prisma.ieepaRate.findMany({
      where: { countryCode },
    });

    const matchingRates: RateRecord[] = allRates.filter((r) => {
      if (r.effectiveDate > parsedDate) return false;
      if (r.endDate && r.endDate <= parsedDate) return false;
      return true;
    });

    const rateLookup = lookupCombinedRate(matchingRates);
    const ieepaDuty = calculateIeepaDuty(numericValue, rateLookup.combinedRate);

    // Eligibility
    const eligibilityResult = checkEligibility({
      entryDate: parsedDate,
      entryType: "01", // standard consumption entry
      liquidationDate: null,
      isAdCvd: false,
    });

    // Interest calculation (deposit date → IEEPA termination)
    const interestRows = await prisma.interestRate.findMany({
      orderBy: { startDate: "asc" },
    });

    const quarterRates: QuarterlyRate[] = interestRows.map((ir) => ({
      startDate: ir.startDate,
      endDate: ir.endDate,
      rate: Number(ir.nonCorporateRate),
    }));

    const estimatedInterest = calculateInterest(ieepaDuty, parsedDate, IEEPA_TERMINATION, quarterRates);
    const estimatedRefund = Math.round((ieepaDuty + estimatedInterest) * 100) / 100;

    return NextResponse.json(
      {
        countryOfOrigin: countryCode,
        entryDate,
        enteredValue: numericValue,
        ieepaRate: rateLookup.combinedRate,
        rateName: rateLookup.rateName,
        rateBreakdown: rateLookup.breakdown,
        ieepaDuty,
        estimatedInterest,
        estimatedRefund,
        eligibility: eligibilityResult.status,
        eligibilityReason: eligibilityResult.reason,
      },
      { headers: cors }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: cors }
    );
  }
}
