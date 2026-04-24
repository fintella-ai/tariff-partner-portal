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

  const elapsedBeforeCurrentSlide = script.scenes
    .slice(0, currentSlide)
    .reduce((sum, s) => sum + s.durationSec, 0);

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

  // Keyboard controls
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

  // Toggle TTS mid-playback
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
      {/* Slide content */}
      <div className="absolute inset-0 rounded-lg overflow-hidden bg-gradient-to-br from-[#0a1628] to-[#1a2a4a] flex flex-col">
        {/* Slide area */}
        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 md:px-16 py-8 relative">
          {/* Visual hint */}
          {scene && (
            <div className="absolute top-4 right-6 text-4xl sm:text-5xl opacity-30">
              {scene.visualHint}
            </div>
          )}

          {/* Slide number */}
          <div className="absolute top-4 left-6 font-body text-[11px] text-white/30 tracking-wider">
            {currentSlide + 1} / {totalScenes}
          </div>

          {scene && (
            <div
              key={currentSlide}
              className="animate-fadeIn"
            >
              <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-brand-gold mb-6 leading-tight">
                {scene.heading}
              </h2>
              <ul className="space-y-3 mb-6">
                {scene.bullets.map((b, i) => (
                  <li
                    key={i}
                    className="font-body text-sm sm:text-base text-white/90 flex items-start gap-3"
                  >
                    <span className="text-brand-gold/60 mt-1 shrink-0">●</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {ttsEnabled && (
                <p className="font-body text-xs sm:text-sm text-white/40 italic mt-4 border-t border-white/10 pt-3">
                  {scene.narration}
                </p>
              )}
            </div>
          )}

          {/* Start overlay */}
          {!hasStarted && !isFinished && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
              <button
                onClick={play}
                className="w-20 h-20 rounded-full bg-brand-gold/20 border-2 border-brand-gold/60 flex items-center justify-center hover:bg-brand-gold/30 transition-colors"
                aria-label="Play presentation"
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-brand-gold ml-1"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          )}

          {/* Finished overlay */}
          {isFinished && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg gap-4">
              <div className="font-display text-xl sm:text-2xl font-bold text-brand-gold">
                Training Complete
              </div>
              <button
                onClick={play}
                className="font-body text-sm text-white bg-brand-gold/20 border border-brand-gold/40 rounded-lg px-6 py-2.5 hover:bg-brand-gold/30 transition-colors"
              >
                Replay
              </button>
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="px-4 sm:px-6 pb-3 pt-1">
          {/* Progress bar */}
          <div
            className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer mb-2 group"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-brand-gold rounded-full transition-all duration-300 relative"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-brand-gold rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Play/Pause */}
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

              {/* Previous */}
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="text-white/50 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-1"
                aria-label="Previous slide"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zM9.5 12l8.5 6V6z" />
                </svg>
              </button>

              {/* Next */}
              <button
                onClick={nextSlide}
                disabled={currentSlide >= totalScenes - 1}
                className="text-white/50 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-1"
                aria-label="Next slide"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
                </svg>
              </button>

              {/* Time display */}
              <span className="font-body text-[11px] text-white/40 tabular-nums ml-1">
                {formatTime(elapsed)} / {formatTime(totalDuration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* TTS toggle */}
              <button
                onClick={handleTtsToggle}
                className={`p-1 transition-colors ${
                  ttsEnabled
                    ? "text-brand-gold"
                    : "text-white/40 hover:text-white/70"
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

      {/* Fade-in animation */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
