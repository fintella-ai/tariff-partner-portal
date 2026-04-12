/**
 * Sentry — client/browser runtime
 *
 * Replaces the older `sentry.client.config.ts` pattern. This file is
 * automatically loaded by Sentry's webpack plugin on every page.
 * Gracefully no-ops when NEXT_PUBLIC_SENTRY_DSN is not set (local dev
 * + previews without keys build + run fine).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Keep sample rate low in prod to stay within Sentry free tier
    // (5k events/month). Bump temporarily if debugging a specific bug.
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    // Session Replay — off for normal sessions (privacy + cost),
    // enabled when an error fires so we can see what the user did
    // in the seconds leading up to the crash.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      // Actually enables the replay sample rates above.
      Sentry.replayIntegration({
        // Privacy: mask text/inputs by default since this portal
        // handles partner banking + PII.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development",
    // Ignore noise: browser extensions, third-party scripts, flaky wifi
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "Failed to fetch",
      "NetworkError",
      "Load failed",
    ],
    // Scrub sensitive partner data from errors before they leave the browser
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.user?.ip_address) delete event.user.ip_address;
      return event;
    },
  });
}

// Required export for @sentry/nextjs to capture navigation transitions
// in App Router. No-ops if Sentry isn't initialized.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
