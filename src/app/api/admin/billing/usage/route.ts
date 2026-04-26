import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/billing/usage
 *
 * Super admin only. Pulls real usage/billing data from service APIs.
 * Returns whatever data each API provides — caller handles missing fields.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "super_admin")
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const results: Record<string, any> = {};

  // ── Twilio Usage ──────────────────────────────────────────────────────
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  if (twilioSid && twilioAuth) {
    try {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const today = now.toISOString().split("T")[0];
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Usage/Records.json?StartDate=${startOfMonth}&EndDate=${today}`,
        { headers: { Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64") } }
      );
      if (res.ok) {
        const data = await res.json();
        const records = data.usage_records || [];
        const totalCost = records.reduce((sum: number, r: any) => sum + parseFloat(r.price || "0"), 0);
        const callCount = records.find((r: any) => r.category === "calls")?.count || 0;
        const smsCount = records.find((r: any) => r.category === "sms")?.count || 0;
        results.twilio = { thisMonth: totalCost, calls: parseInt(callCount), sms: parseInt(smsCount), status: "ok" };
      } else {
        results.twilio = { status: "error", code: res.status };
      }
    } catch (e: any) {
      results.twilio = { status: "error", message: e.message };
    }
  } else {
    results.twilio = { status: "not_configured" };
  }

  // ── SendGrid Usage (plan info) ────────────────────────────────────────
  const sgKey = process.env.SENDGRID_API_KEY;
  if (sgKey) {
    try {
      const [statsRes, profileRes] = await Promise.all([
        fetch("https://api.sendgrid.com/v3/stats?start_date=" + new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0], {
          headers: { Authorization: `Bearer ${sgKey}` },
        }),
        fetch("https://api.sendgrid.com/v3/user/profile", {
          headers: { Authorization: `Bearer ${sgKey}` },
        }),
      ]);

      const statsData = statsRes.ok ? await statsRes.json() : [];
      const totalEmails = Array.isArray(statsData)
        ? statsData.reduce((sum: number, day: any) => {
            const metrics = day.stats?.[0]?.metrics || {};
            return sum + (metrics.requests || 0);
          }, 0)
        : 0;
      const totalDelivered = Array.isArray(statsData)
        ? statsData.reduce((sum: number, day: any) => {
            const metrics = day.stats?.[0]?.metrics || {};
            return sum + (metrics.delivered || 0);
          }, 0)
        : 0;

      results.sendgrid = {
        last30Days: { sent: totalEmails, delivered: totalDelivered },
        status: "ok",
      };
    } catch (e: any) {
      results.sendgrid = { status: "error", message: e.message };
    }
  } else {
    results.sendgrid = { status: "not_configured" };
  }

  // ── Anthropic Usage ───────────────────────────────────────────────────
  // Anthropic doesn't have a public billing API yet, but we can pull from
  // our own AI message logs in the database
  try {
    const { prisma } = await import("@/lib/prisma");
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalMessages, monthMessages] = await Promise.all([
      prisma.aiMessage.count(),
      prisma.aiMessage.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    results.anthropic = {
      totalMessages,
      thisMonthMessages: monthMessages,
      estimatedCost: Math.round(monthMessages * 0.015 * 100) / 100,
      status: "ok",
    };
  } catch {
    results.anthropic = { status: "error", message: "Could not query AI messages" };
  }

  // ── Google Workspace (License Manager API) ─────────────────────────
  // Uses the global Google Calendar OAuth token (which now includes
  // apps.licensing scope). Queries the admin's own license to detect
  // the plan, then lists all users on that SKU for the seat count.
  // Published pricing is hardcoded since Google has no billing API for
  // direct subscribers.
  const WORKSPACE_SKUS: Record<string, { plan: string; monthlyPerSeat: number }> = {
    "1010020027": { plan: "Business Starter", monthlyPerSeat: 7.20 },
    "1010020028": { plan: "Business Standard", monthlyPerSeat: 14.40 },
    "1010020025": { plan: "Business Plus", monthlyPerSeat: 21.60 },
    "1010020029": { plan: "Enterprise Standard", monthlyPerSeat: 23.00 },
    "1010020030": { plan: "Enterprise Plus", monthlyPerSeat: 35.00 },
    "1010060003": { plan: "Enterprise Essentials", monthlyPerSeat: 11.50 },
    "Google-Apps-For-Business": { plan: "Business (legacy)", monthlyPerSeat: 12.00 },
  };
  const LICENSING_BASE = "https://licensing.googleapis.com/apps/licensing/v1";
  try {
    const { prisma: p } = await import("@/lib/prisma");
    const settings = await p.portalSettings.findUnique({ where: { id: "global" } });
    const refreshToken = settings?.googleCalendarRefreshToken;
    if (!refreshToken) {
      results.googleWorkspace = { status: "not_configured", note: "Connect Google Calendar (includes Workspace scope)" };
    } else {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!tokenRes.ok) throw new Error("Token refresh failed");
      const { access_token } = (await tokenRes.json()) as { access_token: string };

      const connectedEmail = settings?.googleCalendarConnectedEmail || "";
      let detectedSku: string | null = null;
      let detectedPlan = "Unknown";
      let seatCount = 0;
      let monthlyPerSeat = 0;

      if (connectedEmail) {
        const licRes = await fetch(
          `${LICENSING_BASE}/product/Google-Apps/users/${encodeURIComponent(connectedEmail)}`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (licRes.ok) {
          const lic = (await licRes.json()) as { skuId?: string; skuName?: string };
          detectedSku = lic.skuId || null;
        }
      }

      if (detectedSku && WORKSPACE_SKUS[detectedSku]) {
        detectedPlan = WORKSPACE_SKUS[detectedSku].plan;
        monthlyPerSeat = WORKSPACE_SKUS[detectedSku].monthlyPerSeat;

        const listRes = await fetch(
          `${LICENSING_BASE}/product/Google-Apps/sku/${detectedSku}/users?maxResults=1000`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (listRes.ok) {
          const list = (await listRes.json()) as { items?: any[] };
          seatCount = list.items?.length || 0;
        }
      }

      results.googleWorkspace = {
        plan: detectedPlan,
        skuId: detectedSku,
        seats: seatCount,
        monthlyPerSeat,
        estimatedMonthly: Math.round(seatCount * monthlyPerSeat * 100) / 100,
        status: detectedSku ? "ok" : "scope_missing",
        note: detectedSku ? undefined : "Re-connect Google Calendar to grant Workspace licensing scope",
      };
    }
  } catch (e: any) {
    results.googleWorkspace = { status: "error", message: e.message };
  }

  // ── Vercel Usage ──────────────────────────────────────────────────────
  // Would need VERCEL_TOKEN — skip if not set
  results.vercel = { status: "not_configured", note: "Set VERCEL_TOKEN for real usage data" };

  // ── Sentry Usage ──────────────────────────────────────────────────────
  const sentryToken = process.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = process.env.SENTRY_ORG || "fintella";
  if (sentryToken) {
    try {
      const res = await fetch(
        `https://sentry.io/api/0/organizations/${sentryOrg}/stats_v2/?field=sum(quantity)&category=error&interval=1d&statsPeriod=30d`,
        { headers: { Authorization: `Bearer ${sentryToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const totalErrors = (data.groups?.[0]?.totals?.["sum(quantity)"] || 0);
        results.sentry = { totalErrors30d: totalErrors, status: "ok" };
      } else {
        results.sentry = { status: "error", code: res.status };
      }
    } catch (e: any) {
      results.sentry = { status: "error", message: e.message };
    }
  } else {
    results.sentry = { status: "not_configured" };
  }

  return NextResponse.json({ usage: results, fetchedAt: new Date().toISOString() });
}
