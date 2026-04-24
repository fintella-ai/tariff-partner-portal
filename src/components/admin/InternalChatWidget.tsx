"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TeamChatPanel from "@/app/(admin)/admin/team-chat/TeamChatPanel";

/**
 * Internal Chat Widget — persistent, draggable admin chat panel.
 *
 * Mounts once in `admin/layout.tsx` (alongside SoftPhone) so it stays
 * alive as the admin navigates from page to page. Wraps the existing
 * TeamChatPanel so thread list + SSE streaming + MentionInput all come
 * for free.
 *
 * State:
 *   - collapsed  → floating FAB bubble (bottom-right)
 *   - open       → draggable panel (default 440×640), shows chat + search
 *
 * Persistence — all localStorage:
 *   - `fintella.admin.internalchat.open` (bool) — open vs minimized
 *   - `fintella.admin.internalchat.pos`  ({x,y} | null) — dragged position
 *
 * Global trigger:
 *   window.__fintellaInternalChat = { open, close, toggle }
 *   Lets sidebar / nav items programmatically pop the widget.
 */

const LS_OPEN = "fintella.admin.internalchat.open";
const LS_POS = "fintella.admin.internalchat.pos";

declare global {
  interface Window {
    __fintellaInternalChat?: {
      open: () => void;
      close: () => void;
      toggle: () => void;
    };
  }
}

export default function InternalChatWidget() {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Drag state
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  // Thread search filter — passed down to TeamChatPanel
  const [searchQuery, setSearchQuery] = useState("");

  // Widget default footprint — mirrors the style block below. Kept
  // as constants so the clamp logic can reason about whether a saved
  // pos still fits the current viewport.
  const WIDGET_W = 440;
  const WIDGET_H = 640;

  // Hydrate from localStorage on mount — but throw away a saved
  // position that would land the widget offscreen (e.g. saved on a
  // larger monitor and reloaded on a smaller one).
  useEffect(() => {
    try {
      const savedOpen = window.localStorage.getItem(LS_OPEN);
      if (savedOpen === "true") setOpen(true);
      const savedPos = window.localStorage.getItem(LS_POS);
      if (savedPos) {
        const parsed = JSON.parse(savedPos) as { x: number; y: number };
        const maxX = window.innerWidth - Math.min(WIDGET_W, window.innerWidth - 32);
        const maxY = window.innerHeight - Math.min(WIDGET_H, window.innerHeight - 120);
        if (
          typeof parsed?.x === "number" &&
          typeof parsed?.y === "number" &&
          parsed.x >= 0 &&
          parsed.y >= 0 &&
          parsed.x <= Math.max(0, maxX) &&
          parsed.y <= Math.max(0, maxY)
        ) {
          setPos(parsed);
        } else {
          // Stale position — let the default bottom-right kick in.
          window.localStorage.removeItem(LS_POS);
        }
      }
    } catch {
      // ignore — quota / privacy mode
    }
    setHydrated(true);
  }, []);

  // If the viewport shrinks while the widget is open and the current
  // position would clip the panel off-screen, snap it back to the
  // default corner.
  useEffect(() => {
    if (!hydrated || !pos) return;
    function checkFit() {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth || rect.bottom > window.innerHeight || rect.left < 0 || rect.top < 0) {
        setPos(null);
        try {
          window.localStorage.removeItem(LS_POS);
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener("resize", checkFit);
    checkFit();
    return () => window.removeEventListener("resize", checkFit);
  }, [hydrated, pos, open]);

  // Persist open/closed
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LS_OPEN, String(open));
    } catch {
      // ignore
    }
  }, [open, hydrated]);

  // Persist position
  useEffect(() => {
    if (!hydrated || !pos) return;
    try {
      window.localStorage.setItem(LS_POS, JSON.stringify(pos));
    } catch {
      // ignore
    }
  }, [pos, hydrated]);

  // Register global API so nav buttons / other widgets can toggle us
  useEffect(() => {
    const api = {
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((v) => !v),
    };
    window.__fintellaInternalChat = api;
    return () => {
      if (window.__fintellaInternalChat === api) delete window.__fintellaInternalChat;
    };
  }, []);

  // Drag handlers — mirrors the SoftPhone pattern
  const onDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const curX = pos?.x ?? rect.left;
      const curY = pos?.y ?? rect.top;
      dragOffset.current = { x: e.clientX - curX, y: e.clientY - curY };
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const el = panelRef.current;
      const w = el ? el.offsetWidth : 440;
      const h = el ? el.offsetHeight : 640;
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - w));
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - h));
      setPos({ x: newX, y: newY });
    },
    [dragging]
  );

  const onDragEnd = useCallback(() => setDragging(false), []);

  // Don't render until hydrated — avoids a flash of the default
  // bottom-right position before localStorage catches up.
  if (!hydrated) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open internal chat"
        title="Internal Chat"
        className="fixed bottom-6 right-24 z-[900] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
        style={{
          background: "linear-gradient(135deg, var(--brand-gold, #c4a050) 0%, rgba(196,160,80,0.85) 100%)",
          color: "#000",
        }}
      >
        <span className="text-xl" aria-hidden>💬</span>
      </button>
    );
  }

  // Position: respect saved pos, otherwise default to bottom-right
  const style: React.CSSProperties = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px` }
    : { right: "24px", bottom: "24px" };

  return (
    <div
      ref={panelRef}
      className="fixed z-[900] flex flex-col rounded-xl shadow-2xl overflow-hidden"
      style={{
        width: "min(440px, calc(100vw - 32px))",
        height: "min(640px, calc(100vh - 120px))",
        background: "var(--app-bg)",
        border: "1px solid var(--app-border)",
        ...style,
      }}
    >
      {/* Drag handle / header */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="flex items-center gap-2 px-3 py-2.5 cursor-move select-none"
        style={{
          background: "var(--app-bg-secondary)",
          borderBottom: "1px solid var(--app-border)",
          touchAction: "none",
        }}
      >
        <span className="text-base" aria-hidden>💬</span>
        <div className="font-body text-[13px] font-semibold flex-1 truncate">Internal Chat</div>
        {/* Minimize — pointer events stopped so the parent drag header
            doesn't swallow the click (previously took 2-3 taps because
            the pointerdown started a drag on the header instead of
            firing the button click). */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          title="Minimize"
          aria-label="Minimize chat"
          className="w-7 h-7 flex items-center justify-center rounded-md theme-text-muted hover:bg-brand-gold/10 transition-colors"
        >
          —
        </button>
      </div>

      {/* Search bar — filters the embedded thread list */}
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search threads or messages…"
          className="w-full rounded-lg px-3 py-1.5 font-body text-[12px] bg-[var(--app-input-bg)] border border-[var(--app-border)] focus:border-brand-gold/40 focus:outline-none"
        />
      </div>

      {/* Embedded chat body — compact mode forces single-pane
          stacked layout so the thread list + messages don't try to
          sit side-by-side inside the narrow widget. */}
      <div className="flex-1 overflow-hidden">
        <TeamChatPanel searchQuery={searchQuery} compact />
      </div>
    </div>
  );
}
