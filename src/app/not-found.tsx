"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FIRM_NAME, FIRM_SHORT } from "@/lib/constants";

/**
 * Next.js 404 — shown when no route matches. Branded to match the
 * global-error.tsx fallback so partners see a consistent, polished
 * experience even on dead links.
 */
export default function NotFound() {
  const router = useRouter();

  return (
    <div
      className="flex min-h-screen items-center justify-center p-5"
      style={{
        background: "var(--app-bg, #060a18)",
        color: "var(--app-text, #e8e6e0)",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          background: "rgba(196, 160, 80, 0.04)",
          border: "1px solid rgba(196, 160, 80, 0.2)",
          borderRadius: "16px",
          padding: "48px 32px",
          textAlign: "center",
        }}
      >
        {/* Brand tag */}
        <div
          style={{
            fontSize: "12px",
            color: "var(--brand-gold, #c4a050)",
            letterSpacing: "2px",
            textTransform: "uppercase",
            marginBottom: "24px",
          }}
        >
          {FIRM_SHORT}
        </div>

        {/* 404 number */}
        <h1
          className="font-display"
          style={{
            fontSize: "96px",
            fontWeight: 800,
            lineHeight: 1,
            margin: "0 0 8px 0",
            color: "var(--brand-gold, #c4a050)",
            letterSpacing: "-2px",
          }}
        >
          404
        </h1>

        {/* Heading */}
        <h2
          className="font-display"
          style={{
            fontSize: "24px",
            fontWeight: 700,
            margin: "0 0 12px 0",
          }}
        >
          Page not found
        </h2>

        {/* Subtext */}
        <p
          className="font-body"
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--app-text-muted, rgba(232, 230, 224, 0.7))",
            margin: "0 0 32px 0",
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Buttons */}
        <div
          style={{ display: "flex", gap: "10px", justifyContent: "center" }}
        >
          <Link
            href="/dashboard/home"
            style={{
              background: "rgba(196, 160, 80, 0.15)",
              border: "1px solid rgba(196, 160, 80, 0.3)",
              color: "#c4a050",
              padding: "12px 28px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.5px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Go Home
          </Link>
          <button
            onClick={() => router.back()}
            style={{
              background: "transparent",
              border: "1px solid rgba(232, 230, 224, 0.15)",
              color: "rgba(232, 230, 224, 0.7)",
              padding: "12px 28px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.5px",
            }}
          >
            Go Back
          </button>
        </div>

        {/* Footer brand */}
        <div
          style={{
            marginTop: "32px",
            fontSize: "10px",
            color: "rgba(232, 230, 224, 0.3)",
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          {FIRM_NAME}
        </div>
      </div>
    </div>
  );
}
