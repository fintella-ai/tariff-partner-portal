import { NextRequest, NextResponse } from "next/server";
import { classifyHtsCode, detectTariffStacking } from "@/lib/hts-classifier";
import { checkPublicRateLimit } from "@/lib/tariff-rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateCheck = checkPublicRateLimit(ip);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rateCheck.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 60000) / 1000)) } },
    );
  }
  const body = await req.json().catch(() => ({}));
  const { htsCode, countryOfOrigin, chapter99Codes } = body as {
    htsCode?: string;
    countryOfOrigin?: string;
    chapter99Codes?: string[];
  };

  if (!htsCode) {
    return NextResponse.json({ error: "htsCode required" }, { status: 400 });
  }

  const classification = classifyHtsCode(
    htsCode,
    countryOfOrigin || "CN",
    chapter99Codes || [],
  );

  const stacking = detectTariffStacking(
    htsCode,
    countryOfOrigin || "CN",
    chapter99Codes || [],
  );

  return NextResponse.json({
    classification,
    stacking,
  });
}
