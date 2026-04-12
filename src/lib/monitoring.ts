/**
 * Monitoring helpers — thin wrapper over Sentry for easier error
 * capture with partner context throughout the app. No-ops gracefully
 * when SENTRY_DSN is not configured.
 */
import * as Sentry from "@sentry/nextjs";

export const MONITORING_CONFIG = {
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
};

/**
 * Capture an exception with optional partner/admin context.
 * Use this in catch blocks of API routes and server actions.
 */
export function captureError(
  error: unknown,
  context?: {
    userId?: string;
    userType?: "partner" | "admin";
    route?: string;
    extra?: Record<string, any>;
  }
) {
  try {
    Sentry.withScope((scope) => {
      if (context?.userId) {
        scope.setUser({
          id: context.userId,
          // IMPORTANT: do not include email, PII, or banking info here
        });
      }
      if (context?.userType) {
        scope.setTag("user_type", context.userType);
      }
      if (context?.route) {
        scope.setTag("route", context.route);
      }
      if (context?.extra) {
        // Strip anything that looks like a secret before sending
        const safeExtra: Record<string, any> = {};
        for (const [key, val] of Object.entries(context.extra)) {
          if (typeof val === "string" && val.length > 100) {
            safeExtra[key] = val.slice(0, 100) + "...[truncated]";
          } else if (
            /password|secret|token|key|auth/i.test(key)
          ) {
            safeExtra[key] = "[REDACTED]";
          } else {
            safeExtra[key] = val;
          }
        }
        scope.setExtras(safeExtra);
      }
      Sentry.captureException(error);
    });
  } catch {
    // Last-resort: never let monitoring itself break a request
    console.error("[monitoring] capture failed:", error);
  }
}

/**
 * Log a non-error event to Sentry (e.g., important business actions).
 * Use sparingly — Sentry free tier caps at 5k events/month.
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: { userId?: string; extra?: Record<string, any> }
) {
  try {
    Sentry.withScope((scope) => {
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.extra) scope.setExtras(context.extra);
      scope.setLevel(level);
      Sentry.captureMessage(message);
    });
  } catch {
    console.log(`[monitoring] ${level}:`, message);
  }
}
