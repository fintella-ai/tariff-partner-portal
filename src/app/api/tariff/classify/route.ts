import { NextRequest, NextResponse } from "next/server";
import { classifyHtsCode, detectTariffStacking } from "@/lib/hts-classifier";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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
