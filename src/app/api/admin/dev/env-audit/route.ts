import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/dev/env-audit — super_admin only
 *
 * Returns boolean presence of every launch-critical env var in the running
 * Vercel runtime. Never returns the actual value. Used for Phase 0 launch
 * prep audit (see docs/launch-status.md § 0.1).
 *
 * Categorized so the admin can see at a glance what's required for launch
 * vs. what's post-launch follow-on.
 */

const AUDIT_GROUPS = {
  "Core (must be set)": [
    "DATABASE_URL",
    "DIRECT_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "SEED_ADMIN_EMAIL",
    "SEED_ADMIN_PASSWORD",
  ],
  "Integrations live today": [
    "SIGNWELL_API_KEY",
    "FROST_LAW_API_KEY",
    "NEXT_PUBLIC_SENTRY_DSN",
  ],
  "Webhook auth (current stance)": [
    "WEBHOOK_SKIP_HMAC",      // should be "true" until Frost signs
    "WEBHOOK_SECRET",          // for HMAC when Frost signs (post-launch)
    "REFERRAL_WEBHOOK_SECRET", // legacy shared secret (optional)
    "WEBHOOK_AUTH_BYPASS",     // should be UNSET — superseded by WEBHOOK_SKIP_HMAC
  ],
  "Launch-day flip": [
    "FINTELLA_LIVE_MODE",      // set to "true" on launch day
    "SENDGRID_API_KEY",        // set when domain auth verifies
    "ANTHROPIC_API_KEY",       // set to enable real PartnerOS AI
  ],
  "Post-launch (Twilio — waiting on A2P 10DLC)": [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_ADMIN_PHONE",
  ],
  "Post-launch (outbound adapter — sub-spec 1 of 4)": [
    "FROST_LAW_OUTBOUND_URL",
    "FROST_LAW_OUTBOUND_API_KEY",
  ],
  "Dev utilities (optional)": [
    "GITHUB_TOKEN", // powers the /admin/dev commits feed
  ],
} as const;

function presence(name: string): { set: boolean; hint?: string } {
  const raw = process.env[name];
  const set = raw !== undefined && raw !== null && raw !== "";
  if (!set) return { set: false };
  const len = raw!.length;
  // Never return the value; just a length hint for sanity checks
  return { set: true, hint: `length=${len}` };
}

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  }

  const report: Record<string, Array<{ name: string; set: boolean; hint?: string; note?: string }>> = {};

  for (const [groupLabel, names] of Object.entries(AUDIT_GROUPS)) {
    report[groupLabel] = (names as readonly string[]).map((name) => {
      const p = presence(name);
      let note: string | undefined;
      // Per-var guidance for ops clarity
      if (name === "WEBHOOK_AUTH_BYPASS" && p.set) note = "⚠ should be UNSET (use WEBHOOK_SKIP_HMAC instead)";
      if (name === "WEBHOOK_SKIP_HMAC" && !p.set) note = "⚠ expected 'true' until Frost Law adds HMAC signing";
      if (name === "FINTELLA_LIVE_MODE" && !p.set) note = "Pre-launch: unset (seed runs); set 'true' to enable live mode";
      if (name === "FINTELLA_LIVE_MODE" && p.set && process.env.FINTELLA_LIVE_MODE !== "true") note = "⚠ set but not 'true' — seed still runs";
      return { name, ...p, note };
    });
  }

  // Summary counts
  const summary = Object.values(report).reduce(
    (acc, vars) => {
      for (const v of vars) {
        if (v.set) acc.set += 1;
        else acc.unset += 1;
      }
      return acc;
    },
    { set: 0, unset: 0 }
  );

  return NextResponse.json({
    runtime: {
      nodeEnv: process.env.NODE_ENV || null,
      vercelEnv: process.env.VERCEL_ENV || null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    },
    summary,
    groups: report,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
