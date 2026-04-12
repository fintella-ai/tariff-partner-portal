/**
 * Sentry — client/browser config
 * Loaded automatically on every page in the browser.
 * Gracefully no-ops when NEXT_PUBLIC_SENTRY_DSN is not set (local dev + previews without keys).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Keep sample rate low in prod to stay within Sentry free tier (5k events/month).
    // Bump temporarily if debugging a specific user-facing bug.
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    replaysSessionSampleRate: 0, // Session replay off by default (privacy + cost)
    replaysOnErrorSampleRate: 1.0, // But capture replays when an error happens
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
    // Ignore noise: browser extensions, third-party scripts, network errors from user's bad wifi
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "Failed to fetch",
      "NetworkError",
      "Load failed",
    ],
    // Don't send events for partners running old browsers we don't support
    beforeSend(event) {
      // Scrub sensitive partner data from errors
      if (event.request?.cookies) delete event.request.cookies;
      if (event.user?.ip_address) delete event.user.ip_address;
      return event;
    },
  });
}
