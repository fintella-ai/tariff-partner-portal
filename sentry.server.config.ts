/**
 * Sentry — server config
 * Loaded on every Next.js server-side render + API route.
 * Gracefully no-ops when SENTRY_DSN is not set.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    // Don't capture common noise
    ignoreErrors: [
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
    ],
    // Scrub secrets from error payloads before they leave our server
    beforeSend(event) {
      // Scrub env-like strings from error messages
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) {
            ex.value = ex.value
              .replace(/sk-ant-api03-[a-zA-Z0-9_-]+/g, "[REDACTED:anthropic_key]")
              .replace(/sk_[a-z]+_[a-zA-Z0-9]+/g, "[REDACTED:stripe_key]")
              .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, "Bearer [REDACTED]")
              .replace(/postgresql:\/\/[^\s]+/g, "postgresql://[REDACTED]");
          }
        }
      }
      return event;
    },
  });
}
