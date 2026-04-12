/**
 * Sentry — edge runtime config
 * Loaded in middleware and edge API routes.
 * Gracefully no-ops when SENTRY_DSN is not set.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  });
}
