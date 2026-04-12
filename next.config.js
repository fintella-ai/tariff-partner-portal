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
    // Silence build output unless debugging
    silent: !process.env.CI,
    // Upload a larger set of source maps for prettier stack traces
    widenClientFileUpload: true,
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
    // Hide source maps from generated client bundles
    hideSourceMaps: true,
  });
} else {
  module.exports = nextConfig;
}
