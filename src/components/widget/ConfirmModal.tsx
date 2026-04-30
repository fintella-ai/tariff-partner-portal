"use client";

import { W, SHADOWS, RADII, glassCardStyle, goldButtonStyle } from "./widget-theme";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(8px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...glassCardStyle(),
          maxWidth: 320,
          padding: 24,
          boxShadow: SHADOWS.modal,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: W.text,
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: W.textSecondary,
            marginBottom: 24,
          }}
        >
          {body}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              color: W.textSecondary,
              borderRadius: RADII.sm,
              padding: "10px 20px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              ...goldButtonStyle(),
              width: "auto",
              padding: "10px 24px",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
