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
  // Parse the URL so we can match on hostname explicitly rather than via
  // substring checks. Substring matching against the full URL is fragile —
  // an attacker could craft `https://attacker.com/?fake=/embed/foo` which
  // contains "/embed/" but is NOT a YouTube embed URL, and would bypass
  // a naive `url.includes("/embed/")` check. The parsed-URL approach is
  // what CodeQL's `js/incomplete-url-substring-sanitization` rule wants.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a valid URL (could be a relative path, a file path, an HLS
    // playlist string, etc.) — return as-is for the iframe to handle.
    return url;
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  // Already an embed URL on a known provider — pass through.
  const isYoutubeEmbed =
    (host === "youtube.com" || host === "www.youtube.com") &&
    path.startsWith("/embed/");
  const isVimeoEmbed = host === "player.vimeo.com";
  if (isYoutubeEmbed || isVimeoEmbed) {
    return url;
  }

  // Standard YouTube watch URL: youtube.com/watch?v=VIDEO_ID
  if (host === "youtube.com" || host === "www.youtube.com") {
    const v = parsed.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]+$/.test(v)) {
      return `https://www.youtube.com/embed/${v}`;
    }
  }

  // Short YouTube share URL: youtu.be/VIDEO_ID
  if (host === "youtu.be") {
    const id = path.replace(/^\//, "");
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
      return `https://www.youtube.com/embed/${id}`;
    }
  }

  // Vimeo URL: vimeo.com/VIDEO_ID
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const idMatch = path.match(/^\/(\d+)/);
    if (idMatch) {
      return `https://player.vimeo.com/video/${idMatch[1]}`;
    }
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

        {/* Media area — responsive 16:9 for video/iframe, compact for audio */}
        <div className={isMobile ? "flex-1 px-2 pb-2" : "px-4 sm:px-5 pb-4 sm:pb-5"}>
          {videoUrl.startsWith("data:audio") ? (
            <div className="flex flex-col items-center justify-center gap-4 py-10 bg-black/20 rounded-lg">
              <div className="text-5xl">🎧</div>
              <div className="font-display text-lg text-[var(--app-text)]">{title}</div>
              <audio
                src={videoUrl}
                className="w-full max-w-xl"
                controls
                preload="metadata"
              />
            </div>
          ) : (
            <div className={isMobile ? "w-full h-full" : "aspect-video w-full"}>
              {videoUrl.startsWith("data:video") || videoUrl.startsWith("blob:") ? (
                <video
                  src={videoUrl}
                  title={title}
                  className="w-full h-full rounded-lg bg-black"
                  controls
                  playsInline
                />
              ) : (
                <iframe
                  src={embedUrl}
                  title={title}
                  className="w-full h-full rounded-lg"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
