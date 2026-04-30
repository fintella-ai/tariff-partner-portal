"use client";

import { useState, useEffect } from "react";
import { W, RADII, SHADOWS, STATUS_COLORS, glassCardStyle, goldButtonStyle, goldGradientStyle } from "./widget-theme";
import ConfirmModal from "./ConfirmModal";

interface Stats {
  totalReferrals: number;
  pendingReferrals: number;
  convertedReferrals: number;
  totalCommissionsEarned: number;
  pendingCommissions: number;
  recentReferrals: {
    clientCompanyName: string;
    status: string;
    createdAt: string;
    estimatedImportValue: string | null;
  }[];
}

export default function WidgetDashboard({
  token,
  onReferClick,
}: {
  token: string;
  onReferClick: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetch("/api/widget/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          border: `2px solid ${W.gold}`, borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ ...glassCardStyle(), padding: 16, textAlign: "center", borderColor: "rgba(239,68,68,0.15)" }}>
          <span style={{ fontSize: 13, color: W.red }}>Failed to load stats</span>
        </div>
      </div>
    );
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

  const statCards = [
    { label: "Referred", value: String(stats.totalReferrals), color: W.text },
    { label: "Earned", value: fmt(stats.totalCommissionsEarned), color: W.green },
    { label: "Pending", value: fmt(stats.pendingCommissions), color: W.gold },
  ];

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {statCards.map((card) => (
          <div key={card.label} style={{
            ...glassCardStyle(), padding: "14px 8px", textAlign: "center",
          }}>
            <div style={{
              ...goldGradientStyle(),
              fontSize: 22, fontWeight: 700,
              fontFamily: "'DM Serif Display', Georgia, serif",
              ...(card.color !== W.text ? { WebkitTextFillColor: card.color, background: "none" } : {}),
            }}>
              {card.value}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: 0.5, color: W.textDim, marginTop: 4,
            }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      <button onClick={onReferClick} style={goldButtonStyle()}>
        Refer a Client →
      </button>

      {stats.recentReferrals.length > 0 && (
        <div>
          <h3 style={{
            fontSize: 11, fontWeight: 600, color: W.textDim,
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
          }}>
            Recent Referrals
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.recentReferrals.map((r, i) => {
              const sc = STATUS_COLORS[r.status] || STATUS_COLORS.submitted;
              return (
                <div
                  key={i}
                  onClick={() => setConfirmOpen(true)}
                  onMouseEnter={() => setHoveredRow(i)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    ...glassCardStyle(hoveredRow === i),
                    padding: "10px 12px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer",
                    boxShadow: hoveredRow === i ? SHADOWS.cardHover : SHADOWS.card,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: W.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.clientCompanyName}
                    </div>
                    <div style={{ fontSize: 11, color: W.textDim, marginTop: 2 }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                      {r.estimatedImportValue ? ` · ${r.estimatedImportValue}` : ""}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "3px 8px",
                    borderRadius: RADII.full, flexShrink: 0, marginLeft: 8,
                    background: sc.bg, color: sc.text,
                    border: `1px solid ${sc.border}`,
                  }}>
                    {r.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Open Fintella Portal?"
        body="This will open your partner dashboard in a new tab."
        confirmLabel="Open Portal"
        onConfirm={() => {
          window.open("https://fintella.partners/dashboard", "_blank");
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
