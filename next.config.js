/** @type {import('next').NextConfig} */
const nextConfig = {};

// ─── SENTRY WEBPACK PLUGIN (OPTIONAL) ────────────────────────────────────────
// Only wrap with Sentry if auth token + org/project are all set at build time.
// This lets local dev + previews without Sentry credentials build successfully.
const hasSentryBuildConfig =
  !!process.env.SENTRY_AUTH_TOKEN &&
  !!process.env.SENTRY_ORG &&
  !!process.env.SENTRY_PROJECT;

if (hasSentryBuildConfig) {
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    // Sentry org + project slugs
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Silence build output unless running in CI
    silent: !process.env.CI,
    // Upload a larger set of source maps for prettier stack traces
    widenClientFileUpload: true,
    // Strip Sentry logger calls from the client bundle to save bytes
    disableLogger: true,
    // Tunnel Sentry events through our own route so ad-blockers +
    // privacy extensions don't drop them. /monitoring is handled by
    // the Sentry SDK itself — no app code needed.
    tunnelRoute: "/monitoring",
  });
} else {
  module.exports = nextConfig;
}
