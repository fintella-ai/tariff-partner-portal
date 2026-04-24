/** @type {import('next').NextConfig} */
const nextConfig = {};

// ─── SENTRY WEBPACK PLUGIN (OPTIONAL) ────────────────────────────────────────
// Org + project slugs are public and stable — hardcoded as defaults so only
// SENTRY_AUTH_TOKEN (the secret) gates the Sentry build wrap. Env vars can
// still override the defaults on a per-environment basis if the slugs ever
// change (e.g. for a staging-project fork).
const SENTRY_ORG = process.env.SENTRY_ORG || "fintella-consulting-llc";
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || "tariff-partner-portal";

if (process.env.SENTRY_AUTH_TOKEN) {
  const { withSentryConfig } = require("@sentry/nextjs");
  module.exports = withSentryConfig(nextConfig, {
    org: SENTRY_ORG,
    project: SENTRY_PROJECT,
    // Silence build output unless running in CI
    silent: !process.env.CI,
    // Upload a larger set of source maps for prettier stack traces
    widenClientFileUpload: true,
    // Strip Sentry logger calls from the client bundle to save bytes
    disableLogger: true,
    // Tunnel Sentry events through our own route so ad-blockers +
    // privacy extensions don't drop them. /monitoring is intentionally
    // more generic than the wizard-default /sentry-tunnel — the literal
    // string "sentry" in a URL is trivially blocked by uBlock Origin et al.
    tunnelRoute: "/monitoring",
  });
} else {
  module.exports = nextConfig;
}
