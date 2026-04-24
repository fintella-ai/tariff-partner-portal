"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface VideoScene {
  heading: string;
  bullets: string[];
  narration: string;
  durationSec: number;
  visualHint: string;
}

interface VideoScript {
  title: string;
  totalDurationSec: number;
  scenes: VideoScene[];
}

interface SlidePlayerProps {
  script: VideoScript;
  onComplete?: () => void;
}

// Per-slide gradient backgrounds — cycles through warm, uplifting palettes
const SLIDE_GRADIENTS = [
  "from-[#0f1c3f] via-[#1a2d5e] to-[#0d2137]",
  "from-[#1a1a2e] via-[#16213e] to-[#0f3460]",
  "from-[#1b1b3a] via-[#2d2d5e] to-[#13132b]",
  "from-[#0d2137] via-[#1a3a5c] to-[#0f1c3f]",
  "from-[#1a2a3a] via-[#2a3a5a] to-[#0f1a2f]",
  "from-[#162032] via-[#1e3050] to-[#0e1828]",
];

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export default function SlidePlayer({ script, onComplete }: SlidePlayerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsRef = useRef<SpeechSynthesisUtterance | null>(null);

  const scene = script.scenes[currentSlide];
  const totalScenes = script.scenes.length;
  const gradient = SLIDE_GRADIENTS[currentSlide % SLIDE_GRADIENTS.length];

  const totalDuration = script.scenes.reduce(
    (sum, s) => sum + s.durationSec,
    0
  );

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (slideTimerRef.current) {
      clearTimeout(slideTimerRef.current);
      slideTimerRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const speakNarration = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!ttsEnabled || typeof window === "undefined" || !window.speechSynthesis)
        return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      utter.onend = () => {
        onEnd?.();
      };
      ttsRef.current = utter;
      window.speechSynthesis.speak(utter);
    },
    [ttsEnabled]
  );

  const goToSlide = useCallback(
    (index: number) => {
      cleanup();
      if (index >= totalScenes) {
        setIsFinished(true);
        setIsPlaying(false);
        setCurrentSlide(totalScenes - 1);
        setElapsed(totalDuration);
        onComplete?.();
        return;
      }
      setCurrentSlide(index);
      setIsFinished(false);
      const newElapsed = script.scenes
        .slice(0, index)
        .reduce((sum, s) => sum + s.durationSec, 0);
      setElapsed(newElapsed);
    },
    [cleanup, totalScenes, totalDuration, script.scenes, onComplete]
  );

  const startSlideTimer = useCallback(
    (slideIndex: number) => {
      if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
      const scene = script.scenes[slideIndex];
      if (!scene) return;

      if (ttsEnabled) {
        speakNarration(scene.narration, () => {
          goToSlide(slideIndex + 1);
          if (slideIndex + 1 < totalScenes) {
            startSlideTimer(slideIndex + 1);
          }
        });
      } else {
        slideTimerRef.current = setTimeout(() => {
          goToSlide(slideIndex + 1);
          if (slideIndex + 1 < totalScenes) {
            startSlideTimer(slideIndex + 1);
          }
        }, scene.durationSec * 1000);
      }
    },
    [script.scenes, ttsEnabled, speakNarration, goToSlide, totalScenes]
  );

  const play = useCallback(() => {
    if (isFinished) {
      setCurrentSlide(0);
      setElapsed(0);
      setIsFinished(false);
    }
    setIsPlaying(true);
    setHasStarted(true);
    const startSlide = isFinished ? 0 : currentSlide;
    startSlideTimer(startSlide);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => Math.min(prev + 1, totalDuration));
    }, 1000);
  }, [isFinished, currentSlide, startSlideTimer, totalDuration]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (slideTimerRef.current) {
      clearTimeout(slideTimerRef.current);
      slideTimerRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const prevSlide = useCallback(() => {
    const wasPlaying = isPlaying;
    pause();
    const newIndex = Math.max(0, currentSlide - 1);
    goToSlide(newIndex);
    if (wasPlaying) {
      setTimeout(() => {
        setIsPlaying(true);
        setHasStarted(true);
        startSlideTimer(newIndex);
        timerRef.current = setInterval(() => {
          setElapsed((prev) => Math.min(prev + 1, totalDuration));
        }, 1000);
      }, 50);
    }
  }, [isPlaying, pause, currentSlide, goToSlide, startSlideTimer, totalDuration]);

  const nextSlide = useCallback(() => {
    const wasPlaying = isPlaying;
    pause();
    const newIndex = currentSlide + 1;
    goToSlide(newIndex);
    if (wasPlaying && newIndex < totalScenes) {
      setTimeout(() => {
        setIsPlaying(true);
        setHasStarted(true);
        startSlideTimer(newIndex);
        timerRef.current = setInterval(() => {
          setElapsed((prev) => Math.min(prev + 1, totalDuration));
        }, 1000);
      }, 50);
    }
  }, [isPlaying, pause, currentSlide, goToSlide, totalScenes, startSlideTimer, totalDuration]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const targetTime = pct * totalDuration;
      let accumulated = 0;
      let targetSlide = 0;
      for (let i = 0; i < totalScenes; i++) {
        accumulated += script.scenes[i].durationSec;
        if (accumulated >= targetTime) {
          targetSlide = i;
          break;
        }
      }
      const wasPlaying = isPlaying;
      pause();
      goToSlide(targetSlide);
      if (wasPlaying) {
        setTimeout(() => {
          setIsPlaying(true);
          setHasStarted(true);
          startSlideTimer(targetSlide);
          timerRef.current = setInterval(() => {
            setElapsed((prev) => Math.min(prev + 1, totalDuration));
          }, 1000);
        }, 50);
      }
    },
    [totalDuration, totalScenes, script.scenes, isPlaying, pause, goToSlide, startSlideTimer]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        prevSlide();
      } else if (e.key === "ArrowRight") {
        nextSlide();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, prevSlide, nextSlide]);

  const handleTtsToggle = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setTtsEnabled((prev) => !prev);
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progressPct = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: "16/9" }}>
      <div className={`absolute inset-0 rounded-lg overflow-hidden bg-gradient-to-br ${gradient} flex flex-col transition-colors duration-700`}>
        {/* Decorative glow orbs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-brand-gold/[0.04] rounded-full blur-3xl pointer-events-none slide-glow" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-blue-500/[0.04] rounded-full blur-3xl pointer-events-none" />

        {/* Slide area */}
        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 md:px-16 py-6 relative z-10">
          {/* Top bar: slide counter + visual hint */}
          <div className="absolute top-4 left-6 right-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-brand-gold/60 animate-pulse" />
              <span className="font-body text-[11px] text-white/40 tracking-widest uppercase">
                {currentSlide + 1} of {totalScenes}
              </span>
            </div>
            {scene && (
              <div className="text-4xl sm:text-5xl slide-emoji">
                {scene.visualHint}
              </div>
            )}
          </div>

          {scene && (
            <div key={currentSlide} className="slide-content">
              {/* Heading with accent line */}
              <div className="mb-6">
                <div className="w-10 h-1 bg-gradient-to-r from-brand-gold to-brand-gold/30 rounded-full mb-4" />
                <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-white leading-tight">
                  {scene.heading}
                </h2>
              </div>

              {/* Bullet points with staggered animation */}
              <ul className="space-y-3.5 mb-5">
                {scene.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="font-body text-sm sm:text-base text-white/85 flex items-start gap-3 slide-bullet"
                    style={{ animationDelay: `${0.15 + i * 0.1}s` }}
                  >
                    <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-gradient-to-br from-brand-gold to-brand-gold/50" />
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>

              {/* Narration subtitle (always visible during playback, subtle) */}
              {hasStarted && !isFinished && (
                <div className="slide-narration">
                  <p className="font-body text-xs sm:text-sm text-white/35 italic leading-relaxed">
                    {scene.narration}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Start overlay */}
          {!hasStarted && !isFinished && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 rounded-lg z-20">
              <div className="font-display text-lg sm:text-xl text-white/70 mb-6 text-center px-8">
                {script.title}
              </div>
              <button
                onClick={play}
                className="group w-20 h-20 rounded-full bg-brand-gold/15 border-2 border-brand-gold/50 flex items-center justify-center hover:bg-brand-gold/25 hover:border-brand-gold/70 hover:scale-105 transition-all duration-300 play-pulse"
                aria-label="Play presentation"
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-brand-gold ml-1 group-hover:scale-110 transition-transform"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <div className="font-body text-[11px] text-white/30 mt-4 tracking-wider uppercase">
                {formatTime(totalDuration)} min
              </div>
            </div>
          )}

          {/* Finished overlay */}
          {isFinished && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-lg gap-5 z-20">
              <div className="text-4xl mb-1">&#127881;</div>
              <div className="font-display text-xl sm:text-2xl font-bold text-white text-center">
                You&apos;re all set!
              </div>
              <p className="font-body text-sm text-white/50 text-center max-w-sm">
                You just learned the key points. Ready to put this into action?
              </p>
              <button
                onClick={play}
                className="font-body text-sm font-semibold text-brand-gold bg-brand-gold/15 border border-brand-gold/40 rounded-full px-8 py-2.5 hover:bg-brand-gold/25 hover:border-brand-gold/60 transition-all duration-300"
              >
                Watch Again
              </button>
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="px-4 sm:px-6 pb-3 pt-1 relative z-10">
          {/* Segmented progress bar — one segment per slide */}
          <div className="flex gap-1 mb-2.5 cursor-pointer" onClick={handleProgressClick}>
            {script.scenes.map((s, i) => {
              const segPct =
                i < currentSlide
                  ? 100
                  : i === currentSlide
                  ? Math.min(
                      100,
                      ((elapsed -
                        script.scenes.slice(0, i).reduce((a, x) => a + x.durationSec, 0)) /
                        s.durationSec) *
                        100
                    )
                  : 0;
              return (
                <div
                  key={i}
                  className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden"
                >
                  <div
                    className="h-full bg-brand-gold rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(0, segPct)}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="text-white/70 hover:text-white transition-colors p-1"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="text-white/50 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
                aria-label="Previous slide"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" />
                </svg>
              </button>

              <button
                onClick={nextSlide}
                disabled={currentSlide >= totalScenes - 1}
                className="text-white/50 hover:text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-1"
                aria-label="Next slide"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
                </svg>
              </button>

              <span className="font-body text-[11px] text-white/35 tabular-nums ml-1">
                {formatTime(elapsed)} / {formatTime(totalDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTtsToggle}
                className={`p-1 transition-colors ${
                  ttsEnabled
                    ? "text-brand-gold"
                    : "text-white/35 hover:text-white/60"
                }`}
                aria-label={ttsEnabled ? "Disable narration" : "Enable narration"}
                title={ttsEnabled ? "Narration on" : "Narration off"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {ttsEnabled ? (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                    </>
                  ) : (
                    <>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bulletIn {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes narrationIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes emojiFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.05); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.04; transform: scale(1); }
          50% { opacity: 0.08; transform: scale(1.1); }
        }
        @keyframes playPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.3); }
          50% { box-shadow: 0 0 0 12px rgba(212, 175, 55, 0); }
        }
        .slide-content {
          animation: slideIn 0.4s ease-out;
        }
        .slide-bullet {
          opacity: 0;
          animation: bulletIn 0.35s ease-out forwards;
        }
        .slide-narration {
          animation: narrationIn 0.6s ease-out 0.4s both;
        }
        .slide-emoji {
          animation: emojiFloat 3s ease-in-out infinite;
        }
        .slide-glow {
          animation: glowPulse 4s ease-in-out infinite;
        }
        .play-pulse {
          animation: playPulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
