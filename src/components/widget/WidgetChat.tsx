"use client";

import { W, glassCardStyle, SHADOWS } from "./widget-theme";

interface WidgetChatProps {
  token: string;
}

export default function WidgetChat({ token: _token }: WidgetChatProps) {
  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          ...glassCardStyle(),
          padding: 24,
          textAlign: "center" as const,
          boxShadow: SHADOWS.card,
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 12 }}>&#128172;</div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: W.text, marginBottom: 4 }}>
          Help &amp; Support
        </h3>
        <p style={{ fontSize: 13, color: W.textSecondary }}>
          Chat support coming soon.
        </p>
      </div>
    </div>
  );
}
