/**
 * Sentry + Next.js server/edge instrumentation hook
 *
 * Next.js 14.0.4+ automatically picks this up at the project root.
 * `register()` runs once per runtime (nodejs + edge) on server start
 * and wires the appropriate Sentry config.
 *
 * `onRequestError` is a Next.js 15+ convention that Sentry 8.28.0+
 * supports — it captures every unhandled server-side request error
 * automatically, so we don't have to wrap every API route in a
 * try/catch just for telemetry.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
