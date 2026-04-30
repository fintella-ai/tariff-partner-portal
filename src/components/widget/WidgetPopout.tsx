"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode, type MouseEvent } from "react";
import { W, RADII, SHADOWS } from "./widget-theme";

const LS_OPEN = "finstella.widget.open";
const LS_POS = "finstella.widget.pos";
const WIDGET_W = 420;
const WIDGET_H = 620;

export default function WidgetPopout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const savedOpen = localStorage.getItem(LS_OPEN);
      if (savedOpen === "true") setOpen(true);
      const savedPos = localStorage.getItem(LS_POS);
      if (savedPos) {
        const p = JSON.parse(savedPos);
        if (p.x >= 0 && p.y >= 0 && p.x < window.innerWidth && p.y < window.innerHeight) {
          setPos(p);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_OPEN, String(open)); } catch {}
  }, [open]);

  useEffect(() => {
    if (pos) try { localStorage.setItem(LS_POS, JSON.stringify(pos)); } catch {}
  }, [pos]);

  const handleDragStart = useCallback((e: MouseEvent) => {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - WIDGET_W));
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - WIDGET_H));
      setPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => setDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  const defaultPos = {
    x: typeof window !== "undefined" ? window.innerWidth - WIDGET_W - 20 : 0,
    y: typeof window !== "undefined" ? window.innerHeight - WIDGET_H - 20 : 0,
  };

  const { x, y } = pos || defaultPos;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #c4a050, #f0d070)",
          border: "none",
          boxShadow: `${SHADOWS.goldCta}, 0 4px 12px rgba(0,0,0,0.3)`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s",
          zIndex: 9999,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1.1)";
          (e.currentTarget as HTMLElement).style.boxShadow = `${SHADOWS.goldCtaHover}, 0 6px 20px rgba(0,0,0,0.4)`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLElement).style.boxShadow = `${SHADOWS.goldCta}, 0 4px 12px rgba(0,0,0,0.3)`;
        }}
      >
        <img
          src="/ai-avatars/stella.png"
          alt="FinStella"
          style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
        />
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: x,
        top: y,
        width: WIDGET_W,
        height: WIDGET_H,
        borderRadius: RADII.xl,
        overflow: "hidden",
        boxShadow: `${SHADOWS.modal}, 0 0 0 1px rgba(255,255,255,0.06)`,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: W.bg,
      }}
    >
      {/* Drag handle bar */}
      <div
        onMouseDown={handleDragStart}
        style={{
          height: 28,
          background: "linear-gradient(135deg, #0c1220, #060a14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px",
          cursor: dragging ? "grabbing" : "grab",
          flexShrink: 0,
          borderBottom: `1px solid ${W.border}`,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: W.gold, opacity: 0.5 }} />
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: W.gold, opacity: 0.3 }} />
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: W.gold, opacity: 0.15 }} />
        </div>
        <span style={{ fontSize: 10, color: W.textDim, fontWeight: 500 }}>FinStellaTMS</span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: W.textDim,
            fontSize: 16, cursor: "pointer", padding: "0 2px",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Widget content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
