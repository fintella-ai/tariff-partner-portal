"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: number[]; // percentages of screen height, e.g. [40, 70, 95]
}

const DEFAULT_SNAP_POINTS = [50, 90];

/**
 * Bottom sheet modal for mobile devices.
 * Slides up from the bottom with drag-to-dismiss support.
 */
export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = DEFAULT_SNAP_POINTS,
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  const handleDragStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setDragOffset(delta);
    }
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    if (dragOffset > 100) {
      // Dismiss if dragged down enough
      onClose();
    } else if (dragOffset > 40 && currentSnap > 0) {
      // Snap to smaller size
      setCurrentSnap(currentSnap - 1);
    }
    setDragOffset(0);
  }, [dragOffset, currentSnap, onClose]);

  if (!isOpen) return null;

  const sheetHeight = snapPoints[currentSnap] || snapPoints[0];

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-[var(--app-bg)] border-t border-[var(--app-border)] rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          height: `${sheetHeight}vh`,
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? "none" : "transform 0.3s ease, height 0.3s ease",
        }}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center py-3 cursor-grab active:cursor-grabbing shrink-0"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
        >
          <div className="w-10 h-1 rounded-full bg-[var(--app-input-bg)]" />
        </div>

        {/* Title */}
        {title && (
          <div className="px-5 pb-3 border-b border-[var(--app-border)] shrink-0">
            <h3 className="font-display text-base font-bold">{title}</h3>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
