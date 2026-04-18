"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Hook that adds column-resize handles to any table.
 *
 * Usage:
 *   const { columnWidths, getResizeHandler } = useResizableColumns(initialWidths);
 *
 *   <th style={{ width: columnWidths[0] }}>
 *     Name
 *     <span {...getResizeHandler(0)} />
 *   </th>
 *
 * initialWidths: array of starting widths in px (e.g. [200, 150, 120])
 * minWidth / maxWidth: constraints per column (defaults 60px / 600px)
 */
export function useResizableColumns(
  initialWidths: number[],
  { minWidth = 60, maxWidth = 600 }: { minWidth?: number; maxWidth?: number } = {}
) {
  const [columnWidths, setColumnWidths] = useState<number[]>(initialWidths);
  const dragging = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      const { colIndex, startX, startWidth } = dragging.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      setColumnWidths((prev) => {
        const next = [...prev];
        next[colIndex] = newWidth;
        return next;
      });
    },
    [minWidth, maxWidth]
  );

  const onMouseUp = useCallback(() => {
    dragging.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const getResizeHandler = useCallback(
    (colIndex: number) => ({
      onMouseDown: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragging.current = {
          colIndex,
          startX: e.clientX,
          startWidth: columnWidths[colIndex],
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      },
      className:
        "absolute right-0 top-0 bottom-0 w-px cursor-col-resize bg-[var(--app-border)] hover:w-1 hover:bg-brand-gold/60 transition-all z-10",
      style: { touchAction: "none" } as React.CSSProperties,
    }),
    [columnWidths]
  );

  return { columnWidths, setColumnWidths, getResizeHandler };
}
