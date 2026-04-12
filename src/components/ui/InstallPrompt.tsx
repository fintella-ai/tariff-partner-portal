"use client";

import { useState, useEffect } from "react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";

function ShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16,6 12,2 8,6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export default function InstallPrompt() {
  const { isIOS, isAndroid, isSafari, canPromptNatively, promptInstall, dismiss, shouldShow } = useInstallPrompt();
  const [copied, setCopied] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");

  // Delay showing the skip button
  useEffect(() => {
    if (!shouldShow) return;
    const timer = setTimeout(() => setShowSkip(true), 5000);
    return () => clearTimeout(timer);
  }, [shouldShow]);

  // Fetch logo
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings?.logoUrl) setLogoUrl(settings.logoUrl);
      })
      .catch(() => {});
  }, []);

  if (!shouldShow) return null;

  const isDesktop = !isIOS && !isAndroid;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "linear-gradient(180deg, #060a18 0%, #0c1630 50%, #060a18 100%)" }}
    >
      <div className="w-full max-w-md mx-auto px-6 py-10 text-center">
        {/* Logo */}
        <div className="mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt="Fintella" className="max-h-16 mx-auto object-contain" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#c4a050] to-[#e8c060] flex items-center justify-center mx-auto">
              <span className="text-3xl font-bold text-white font-display">F</span>
            </div>
          )}
        </div>

        {/* Heading */}
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
          Get the Fintella App
        </h1>
        <p className="font-body text-sm text-white/60 mb-8 max-w-sm mx-auto leading-relaxed">
          Add Fintella to your home screen for instant access to your deals, commissions, and partner portal.
        </p>

        {/* ── ANDROID: Native install button ── */}
        {isAndroid && canPromptNatively && (
          <div className="mb-8">
            <button
              onClick={promptInstall}
              className="w-full bg-gradient-to-r from-[#c4a050] to-[#e8c060] text-[#060a18] font-body text-base font-bold py-4 rounded-xl shadow-lg shadow-[#c4a050]/20 hover:shadow-[#c4a050]/40 transition-all active:scale-[0.98]"
            >
              Install Fintella App
            </button>
            <p className="font-body text-xs text-white/30 mt-3">
              Or tap the browser menu and select &quot;Add to Home Screen&quot;
            </p>
          </div>
        )}

        {/* ── ANDROID: Manual instructions (no native prompt) ── */}
        {isAndroid && !canPromptNatively && (
          <div className="mb-8 space-y-3">
            <Step num={1} icon={<DotsIcon />} text={'Tap the menu icon (⋮) in your browser'} />
            <Step num={2} icon={<PlusSquareIcon />} text={'"Add to Home Screen"'} />
            <Step num={3} icon={null} text={'Tap "Add" to confirm'} />
          </div>
        )}

        {/* ── iOS in Safari: Step-by-step instructions ── */}
        {isIOS && isSafari && (
          <div className="mb-8 space-y-3">
            <Step num={1} icon={<ShareIcon />} text={'Tap the Share button at the bottom of Safari'} />
            <Step num={2} icon={<PlusSquareIcon />} text={'Scroll down and tap "Add to Home Screen"'} />
            <Step num={3} icon={null} text={'Tap "Add" in the top right corner'} />
          </div>
        )}

        {/* ── iOS NOT in Safari: redirect message ── */}
        {isIOS && !isSafari && (
          <div className="mb-8">
            <div className="p-5 rounded-xl border border-[#c4a050]/20 bg-[#c4a050]/[0.04] mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </div>
                <div>
                  <div className="font-body text-sm font-semibold text-white">Open in Safari to Install</div>
                  <div className="font-body text-[11px] text-white/50">iPhone requires Safari to add apps to your home screen</div>
                </div>
              </div>
              <p className="font-body text-[13px] text-white/70 leading-relaxed mb-4">
                Copy the link below and paste it into <strong className="text-white">Safari</strong> to install the Fintella app on your home screen.
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + "/dashboard/home");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }}
                className={`w-full py-3.5 rounded-xl font-body text-sm font-bold transition-all ${
                  copied
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-gradient-to-r from-[#c4a050] to-[#e8c060] text-[#060a18] shadow-lg shadow-[#c4a050]/20"
                }`}
              >
                {copied ? "Link Copied! Now open Safari & paste" : "Copy Link for Safari"}
              </button>
            </div>
            <div className="text-center">
              <p className="font-body text-[11px] text-white/30">Then in Safari: Share → Add to Home Screen → Add</p>
            </div>
          </div>
        )}

        {/* ── Desktop ── */}
        {isDesktop && (
          <div className="mb-8">
            {canPromptNatively ? (
              <>
                <button
                  onClick={promptInstall}
                  className="w-full bg-gradient-to-r from-[#c4a050] to-[#e8c060] text-[#060a18] font-body text-base font-bold py-4 rounded-xl shadow-lg shadow-[#c4a050]/20 hover:shadow-[#c4a050]/40 transition-all active:scale-[0.98]"
                >
                  Install Fintella App
                </button>
                <p className="font-body text-xs text-white/30 mt-3">
                  Installs as a standalone desktop app
                </p>
              </>
            ) : (
              <div className="p-5 rounded-xl border border-white/10 bg-white/5">
                <p className="font-body text-sm text-white/70 leading-relaxed">
                  For the best experience, visit <span className="text-[#c4a050] font-semibold">fintella.partners</span> on your phone and add it to your home screen.
                </p>
              </div>
            )}
          </div>
        )}

        {/* App preview badges */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-body text-[11px] text-white/50">Instant Access</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <span className="w-2 h-2 rounded-full bg-[#c4a050]" />
            <span className="font-body text-[11px] text-white/50">No App Store</span>
          </span>
        </div>

        {/* Skip button (appears after delay) */}
        <div style={{ opacity: showSkip ? 1 : 0, transition: "opacity 0.5s ease" }}>
          <button
            onClick={dismiss}
            className="font-body text-xs text-white/25 hover:text-white/40 transition-colors py-2 px-4"
            disabled={!showSkip}
          >
            Continue to Portal &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ num, icon, text }: { num: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-[#c4a050]/20 bg-[#c4a050]/[0.04] text-left">
      <div className="w-8 h-8 rounded-full bg-[#c4a050]/20 flex items-center justify-center shrink-0">
        <span className="font-display text-sm font-bold text-[#c4a050]">{num}</span>
      </div>
      {icon && <div className="text-[#c4a050] shrink-0">{icon}</div>}
      <div className="font-body text-sm text-white/80">{text}</div>
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
