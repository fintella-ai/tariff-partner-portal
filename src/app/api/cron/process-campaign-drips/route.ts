import { NextRequest, NextResponse } from "next/server";
import { processCampaignDrips } from "@/lib/campaign-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processCampaignDrips();

  return NextResponse.json({
    ...result,
    timestamp: new Date().toISOString(),
  });
}
