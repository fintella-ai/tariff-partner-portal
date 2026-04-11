"use client";

import { useEffect, useCallback, useState } from "react";

/**
 * Props for the VideoModal component.
 */
interface VideoModalProps {
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /** Callback fired when the modal should close (overlay click, ESC key, or close button). */
  onClose: () => void;
  /** Raw video URL — YouTube, Vimeo, or direct embed URLs are all accepted. */
  videoUrl: string;
  /** Title displayed above the video player. */
  title: string;
}

/**
 * Converts a standard YouTube or Vimeo share/watch URL into its embeddable
 * counterpart. If the URL is already an embed URL or unrecognized, it is
 * returned as-is.
 *
 * Supported conversions:
 *  - youtube.com/watch?v=XXX  -> youtube.com/embed/XXX
 *  - youtu.be/XXX             -> youtube.com/embed/XXX
 *  - vimeo.com/XXX            -> player.vimeo.com/video/XXX
 */
function toEmbedUrl(url: string): string {
  // Already an embed URL — pass through.
  if (url.includes("/embed/") || url.includes("player.vimeo.com")) {
    return url;
  }

  // Standard YouTube watch URL: youtube.com/watch?v=VIDEO_ID
  const ytWatchMatch = url.match(
    /(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/
  );
  if (ytWatchMatch) {
    return `https://www.youtube.com/embed/${ytWatchMatch[1]}`;
  }

  // Short YouTube share URL: youtu.be/VIDEO_ID
  const ytShortMatch = url.match(/youtu\.be\/([A-Za-z0-9_-]+)/);
  if (ytShortMatch) {
    return `https://www.youtube.com/embed/${ytShortMatch[1]}`;
  }

  // Vimeo URL: vimeo.com/VIDEO_ID
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  // Unrecognized — use as-is (could be a direct MP4, HLS, etc.).
  return url;
}

/**
 * A full-screen modal overlay that embeds a YouTube or Vimeo video in a
 * responsive 16:9 iframe. Closes on overlay click, ESC key, or the X button.
 *
 * On mobile viewports (< 640 px) the modal stretches to nearly full-screen
 * for a better viewing experience.
 *
 * @example
 * ```tsx
 * <VideoModal
 *   isOpen={showVideo}
 *   onClose={() => setShowVideo(false)}
 *   videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
 *   title="Product Demo"
 * />
 * ```
 */
export default function VideoModal({
  isOpen,
  onClose,
  videoUrl,
  title,
}: VideoModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  /** Close the modal when the user presses the Escape key. */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  // Attach / detach the keydown listener based on open state.
  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Detect mobile viewport on mount and resize.
  useEffect(() => {
    if (!isOpen) return;

    const check = () => setIsMobile(window.innerWidth < 640);
    check();

    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [isOpen]);

  if (!isOpen) return null;

  const embedUrl = toEmbedUrl(videoUrl);

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Modal container — stop click propagation so clicking inside doesn't close */}
      <div
        className={
          isMobile
            ? "relative w-[95vw] h-[90vh] bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-2xl flex flex-col overflow-hidden"
            : "relative w-full max-w-4xl mx-4 bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-2xl flex flex-col overflow-hidden"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3">
          <span className="font-body text-sm font-semibold text-[var(--app-text)] truncate">
            {title}
          </span>

          {/* Close button */}
          <button
            onClick={onClose}
            className="text-[var(--app-text-secondary)] hover:text-[var(--app-text)] transition-colors cursor-pointer p-1"
            aria-label="Close video modal"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video area — responsive 16:9 aspect ratio */}
        <div className={isMobile ? "flex-1 px-2 pb-2" : "px-4 sm:px-5 pb-4 sm:pb-5"}>
          <div className={isMobile ? "w-full h-full" : "aspect-video w-full"}>
            <iframe
              src={embedUrl}
              title={title}
              className="w-full h-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
}
