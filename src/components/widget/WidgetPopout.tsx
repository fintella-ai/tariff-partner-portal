"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode, type MouseEvent } from "react";
import { W, RADII, SHADOWS } from "./widget-theme";

const LS_POS = "finstella.widget.pos";
const WIDGET_W = 440;
const WIDGET_H = 640;
const PAD = 16;

interface Props {
  children: ReactNode;
  onClose?: () => void;
  onMinimize?: () => void;
}

export default function WidgetPopout({ children, onClose, onMinimize }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const savedPos = localStorage.getItem(LS_POS);
      if (savedPos) {
        const p = JSON.parse(savedPos);
        if (p.x >= 0 && p.y >= 0 && p.x < window.innerWidth && p.y < window.innerHeight) {
          setPos(p);
          return;
        }
      }
    } catch {}
    setPos({
      x: window.innerWidth - WIDGET_W - PAD,
      y: window.innerHeight - WIDGET_H - PAD,
    });
  }, []);

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
    const onMove = (e: globalThis.MouseEvent) => {
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - WIDGET_W)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - WIDGET_H)),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  const { x, y } = pos || { x: 0, y: 0 };

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed", left: x, top: y,
        width: WIDGET_W, height: WIDGET_H,
        borderRadius: RADII.xl, overflow: "hidden",
        boxShadow: `${SHADOWS.modal}, 0 0 0 1px rgba(255,255,255,0.08)`,
        zIndex: 9999,
        display: "flex", flexDirection: "column",
        background: W.bg,
        padding: PAD,
      }}
    >
      {/* Top bar: minimize + close */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 8, cursor: dragging ? "grabbing" : "grab",
          userSelect: "none", flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <img
            src="/api/favicon"
            alt=""
            style={{ width: 16, height: 16, borderRadius: 3, objectFit: "contain" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span style={{ fontSize: 10, color: W.textDim, fontWeight: 500 }}>FinStellaTMS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {onMinimize && (
            <button
              onClick={onMinimize}
              style={{
                background: "none", border: "none", cursor: "pointer",
                width: 20, height: 20, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: W.textDim, fontSize: 14, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = W.gold; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = W.textDim; }}
            >
              ▬
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                width: 20, height: 20, borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: W.textDim, fontSize: 14, transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = W.red; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = W.textDim; }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Widget content */}
      <div style={{
        flex: 1, overflow: "hidden",
        display: "flex", flexDirection: "column",
        borderRadius: RADII.md,
        border: `1px solid ${W.border}`,
      }}>
        {children}
      </div>
    </div>
  );
}
