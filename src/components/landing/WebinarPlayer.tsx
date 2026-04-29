"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Evergreen webinar video player with CTA overlay at key moments.
 * Supports YouTube embed, Loom, or direct MP4 via PortalSettings.
 * Falls back to a placeholder until a real video URL is configured.
 */
export default function WebinarPlayer() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showCta, setShowCta] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.settings?.webinarVideoUrl) setVideoUrl(d.settings.webinarVideoUrl);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((p) => {
        const next = p + 1;
        if (next === 600 || next === 780) setShowCta(true);
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const isYouTube = videoUrl?.includes("youtube.com") || videoUrl?.includes("youtu.be");
  const isLoom = videoUrl?.includes("loom.com");

  return (
    <div className="relative">
      <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
        {videoUrl ? (
          isYouTube || isLoom ? (
            <iframe
              src={videoUrl + (videoUrl.includes("?") ? "&" : "?") + "autoplay=1"}
              className="w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title="Fintella Partner Webinar"
            />
          ) : (
            <video
              src={videoUrl}
              className="w-full h-full object-contain"
              controls
              autoPlay
              playsInline
            />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-8">
            <div className="text-5xl mb-4">🎬</div>
            <h3 className="font-display text-lg mb-2" style={{ color: "#c4a050" }}>Webinar Video Coming Soon</h3>
            <p className="text-sm text-white/50 max-w-md">
              The video presentation is being produced. In the meantime, learn about the opportunity at our partner page.
            </p>
            <a
              href="/partners/brokers"
              className="mt-4 inline-block px-6 py-2.5 rounded-xl font-semibold text-sm text-black"
              style={{ background: "#c4a050" }}
            >
              View Partner Details →
            </a>
            <p className="text-[10px] text-white/30 mt-6">
              Admin: Set the webinar video URL in Settings → Integrations → Webinar Video URL
            </p>
          </div>
        )}
      </div>

      {/* CTA overlay — appears at 10min and 13min marks */}
      {showCta && (
        <div className="absolute bottom-4 left-4 right-4 bg-black/90 backdrop-blur-sm border border-[#c4a050]/30 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm" style={{ color: "#c4a050" }}>Ready to start earning?</div>
            <div className="text-xs text-white/50">Apply to the partner program — free, no obligations.</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setShowCta(false)}
              className="text-xs text-white/40 px-3 py-2 hover:text-white/60"
            >
              Dismiss
            </button>
            <a
              href="/partners/brokers"
              className="px-4 py-2 rounded-lg font-semibold text-xs text-black"
              style={{ background: "#c4a050" }}
            >
              Apply Now
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
