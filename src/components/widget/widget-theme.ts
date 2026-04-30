import type { CSSProperties } from "react";

export const W = {
  bg: "#060a14",
  bgCard: "rgba(255,255,255,0.03)",
  bgCardHover: "rgba(255,255,255,0.06)",
  bgInput: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.12)",
  borderFocus: "#c4a050",
  text: "rgba(255,255,255,0.95)",
  textSecondary: "rgba(255,255,255,0.6)",
  textDim: "rgba(255,255,255,0.35)",
  gold: "#c4a050",
  goldLight: "#f0d070",
  goldGlow: "rgba(196,160,80,0.3)",
  goldGlowStrong: "rgba(196,160,80,0.45)",
  blue: "#4f6ef7",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.1)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.1)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
} as const;

export const SHADOWS = {
  card: "0 2px 12px rgba(0,0,0,0.3)",
  cardHover: "0 4px 20px rgba(0,0,0,0.4)",
  goldCta: "0 4px 20px rgba(196,160,80,0.3)",
  goldCtaHover: "0 6px 28px rgba(196,160,80,0.45)",
  modal: "0 16px 48px rgba(0,0,0,0.5)",
  input: "0 0 0 3px rgba(196,160,80,0.15)",
} as const;

export const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  submitted: { bg: "rgba(245,158,11,0.12)", text: "#fbbf24", border: "rgba(245,158,11,0.2)" },
  contacted: { bg: "rgba(59,130,246,0.12)", text: "#60a5fa", border: "rgba(59,130,246,0.2)" },
  qualified: { bg: "rgba(168,85,247,0.12)", text: "#c084fc", border: "rgba(168,85,247,0.2)" },
  converted: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", border: "rgba(34,197,94,0.2)" },
  rejected: { bg: "rgba(239,68,68,0.12)", text: "#f87171", border: "rgba(239,68,68,0.2)" },
};

export function goldGradientStyle(): CSSProperties {
  return {
    background: "linear-gradient(135deg, #c4a050, #f0d070)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  };
}

export function goldButtonStyle(disabled = false): CSSProperties {
  return {
    background: disabled ? "rgba(196,160,80,0.3)" : "linear-gradient(135deg, #c4a050, #f0d070)",
    color: "#060a14",
    fontWeight: 700,
    padding: "14px 28px",
    borderRadius: RADII.md,
    border: "none",
    boxShadow: disabled ? "none" : SHADOWS.goldCta,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
    fontSize: 14,
    width: "100%",
    opacity: disabled ? 0.5 : 1,
  };
}

export function greenButtonStyle(disabled = false): CSSProperties {
  return {
    background: disabled ? "rgba(34,197,94,0.3)" : "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "#fff",
    fontWeight: 700,
    padding: "14px 28px",
    borderRadius: RADII.md,
    border: "none",
    boxShadow: disabled ? "none" : "0 4px 20px rgba(34,197,94,0.3)",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
    fontSize: 14,
    width: "100%",
    opacity: disabled ? 0.5 : 1,
  };
}

export function glassCardStyle(hover = false): CSSProperties {
  return {
    background: hover ? W.bgCardHover : W.bgCard,
    border: `1px solid ${hover ? W.borderHover : W.border}`,
    borderRadius: RADII.lg,
    backdropFilter: "blur(12px)",
    transition: "all 0.2s ease",
  };
}

export function inputStyle(focused = false): CSSProperties {
  return {
    background: W.bgInput,
    border: `1px solid ${focused ? W.borderFocus : "rgba(255,255,255,0.08)"}`,
    borderRadius: RADII.sm + 2,
    color: W.text,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxShadow: focused ? SHADOWS.input : "none",
    transition: "all 0.2s ease",
  };
}
