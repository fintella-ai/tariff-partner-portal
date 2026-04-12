"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";

/**
 * Next.js global error boundary — catches uncaught exceptions anywhere in
 * the app (client or SSR). Reports to Sentry when configured, and shows
 * a friendly branded fallback so partners never see a raw React error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ship the error to Sentry (no-ops if Sentry isn't configured)
    Sentry.captureException(error);
    // Also log to console for local dev
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          background: "#060a18",
          color: "#e8e6e0",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            background: "rgba(196, 160, 80, 0.04)",
            border: "1px solid rgba(196, 160, 80, 0.2)",
            borderRadius: "16px",
            padding: "40px 32px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
          <div
            style={{
              fontSize: "12px",
              color: "#c4a050",
              letterSpacing: "2px",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            {FIRM_SHORT}
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              margin: "0 0 12px 0",
              fontFamily: '"Playfair Display", Georgia, serif',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "14px",
              lineHeight: "1.6",
              color: "rgba(232, 230, 224, 0.7)",
              margin: "0 0 24px 0",
            }}
          >
            An unexpected error occurred. Our team has been notified
            automatically. Please try again, and if the problem persists,
            contact support.
          </p>
          {error.digest && (
            <div
              style={{
                fontSize: "11px",
                color: "rgba(232, 230, 224, 0.4)",
                fontFamily: "monospace",
                marginBottom: "24px",
                padding: "8px",
                background: "rgba(0, 0, 0, 0.2)",
                borderRadius: "6px",
                wordBreak: "break-all",
              }}
            >
              Error ID: {error.digest}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                background: "rgba(196, 160, 80, 0.15)",
                border: "1px solid rgba(196, 160, 80, 0.3)",
                color: "#c4a050",
                padding: "12px 24px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                letterSpacing: "0.5px",
              }}
            >
              Try Again
            </button>
            <a
              href="/dashboard/home"
              style={{
                background: "transparent",
                border: "1px solid rgba(232, 230, 224, 0.15)",
                color: "rgba(232, 230, 224, 0.7)",
                padding: "12px 24px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                textDecoration: "none",
                letterSpacing: "0.5px",
              }}
            >
              Go Home
            </a>
          </div>
          <div
            style={{
              marginTop: "24px",
              fontSize: "10px",
              color: "rgba(232, 230, 224, 0.3)",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {FIRM_NAME}
          </div>
        </div>
      </body>
    </html>
  );
}
