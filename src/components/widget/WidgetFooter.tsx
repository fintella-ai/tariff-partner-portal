"use client";

import { useState } from "react";

export default function WidgetFooter() {
  const [linkHover, setLinkHover] = useState(false);

  return (
    <div
      style={{
        height: 36,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "#060a14",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <img
          src="/api/favicon"
          alt=""
          style={{ width: 14, height: 14, borderRadius: 3, objectFit: "contain" }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          Powered by Fintella
        </span>
      </div>
      <a
        href="https://fintella.partners/dashboard"
        target="_blank"
        rel="noopener"
        style={{
          fontSize: 11,
          color: linkHover ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.35)",
          textDecoration: "none",
        }}
        onMouseEnter={() => setLinkHover(true)}
        onMouseLeave={() => setLinkHover(false)}
      >
        Open Fintella Partner Portal &rarr;
      </a>
    </div>
  );
}
