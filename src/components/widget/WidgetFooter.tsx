"use client";

export default function WidgetFooter() {
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
          color: "#c4a050",
          textDecoration: "none",
          fontWeight: 500,
          animation: "portalGlow 3s ease-in-out infinite",
        }}
      >
        Fintella Partner Portal &rarr;
      </a>
      <style>{`
        @keyframes portalGlow {
          0%, 100% { text-shadow: 0 0 4px rgba(196,160,80,0.2); }
          50% { text-shadow: 0 0 10px rgba(196,160,80,0.5), 0 0 4px rgba(196,160,80,0.3); }
        }
      `}</style>
    </div>
  );
}
