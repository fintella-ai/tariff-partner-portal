"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CallState =
  | "idle"
  | "registering"
  | "ready"
  | "connecting"
  | "ringing"
  | "in-call"
  | "ended"
  | "error"
  | "demo";

type SoftPhoneAPI = {
  call: (phone: string, partnerName?: string) => void;
  hangup: () => void;
  state: CallState;
};

// Module-level reference so the partner profile "Call Partner" button can
// dispatch an event that the docked SoftPhone picks up without a provider.
// Keeps the wiring minimal while still letting any page trigger a call.
declare global {
  interface Window {
    __fintellaSoftphone?: SoftPhoneAPI;
  }
}

type PartnerOption = {
  partnerCode: string;
  firstName: string;
  lastName: string;
  mobilePhone: string | null;
  companyName: string | null;
};

export default function SoftPhone() {
  const [state, setState] = useState<CallState>("idle");
  const [open, setOpen] = useState(false);
  const [currentNumber, setCurrentNumber] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);
  // Dialer UI state
  const [dialDigits, setDialDigits] = useState("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Drag state ─────────────────────────────────────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const curX = pos?.x ?? rect.left;
    const curY = pos?.y ?? rect.top;
    dragOffset.current = { x: e.clientX - curX, y: e.clientY - curY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const el = panelRef.current;
    const w = el ? el.offsetWidth : 340;
    const h = el ? el.offsetHeight : 500;
    const newX = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - w));
    const newY = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - h));
    setPos({ x: newX, y: newY });
  }, [dragging]);

  const onDragEnd = useCallback(() => {
    setDragging(false);
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────

  const startDurationTimer = useCallback(() => {
    setDurationSec(0);
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = setInterval(() => {
      setDurationSec((d) => d + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  // ── Device init ────────────────────────────────────────────────────────────

  const ensureDevice = useCallback(async () => {
    if (deviceRef.current) return deviceRef.current;
    setState("registering");
    try {
      const res = await fetch("/api/twilio/voice-token");
      const data = await res.json();
      if (data.demo || !data.token) {
        setMissing(data.missing || []);
        setState("demo");
        return null;
      }
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(data.token, { logLevel: 1 });
      device.on("registered", () => setState("ready"));
      device.on("error", (err: any) => {
        console.error("[SoftPhone] device error:", err);
        setErrorMsg(err?.message || "Device error");
        setState("error");
      });
      await device.register();
      deviceRef.current = device;
      return device;
    } catch (err: any) {
      console.error("[SoftPhone] init failed:", err);
      setErrorMsg(err?.message || "Failed to initialize softphone");
      setState("error");
      return null;
    }
  }, []);

  // ── Call / hangup ──────────────────────────────────────────────────────────

  const call = useCallback(
    async (phone: string, partnerName?: string) => {
      setOpen(true);
      setCurrentNumber(phone);
      setCurrentName(partnerName || "");
      setErrorMsg(null);
      setMuted(false);
      const device = await ensureDevice();
      if (!device) {
        if (state === "demo") {
          setState("in-call");
          startDurationTimer();
        }
        return;
      }
      setState("connecting");
      try {
        const c = await device.connect({ params: { To: phone } });
        callRef.current = c;
        c.on("ringing", () => setState("ringing"));
        c.on("accept", () => { setState("in-call"); startDurationTimer(); });
        c.on("disconnect", () => { setState("ended"); stopDurationTimer(); callRef.current = null; });
        c.on("cancel", () => { setState("ended"); stopDurationTimer(); callRef.current = null; });
        c.on("reject", () => { setState("ended"); stopDurationTimer(); callRef.current = null; });
        c.on("error", (err: any) => {
          console.error("[SoftPhone] call error:", err);
          setErrorMsg(err?.message || "Call error");
          setState("error");
          stopDurationTimer();
        });
      } catch (err: any) {
        console.error("[SoftPhone] connect failed:", err);
        setErrorMsg(err?.message || "Call failed");
        setState("error");
      }
    },
    [ensureDevice, startDurationTimer, stopDurationTimer, state]
  );

  const hangup = useCallback(() => {
    try { callRef.current?.disconnect?.(); } catch {}
    callRef.current = null;
    stopDurationTimer();
    setState("ended");
  }, [stopDurationTimer]);

  const toggleMute = useCallback(() => {
    if (callRef.current?.mute) {
      callRef.current.mute(!muted);
      setMuted(!muted);
    }
  }, [muted]);

  // ── Window API ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const api: SoftPhoneAPI = { call, hangup, state };
    window.__fintellaSoftphone = api;
    return () => {
      if (window.__fintellaSoftphone === api) delete window.__fintellaSoftphone;
    };
  }, [call, hangup, state]);

  // ── Partner directory ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open || partnersLoaded) return;
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((data) => {
        const list: PartnerOption[] = (data.partners || []).map((p: any) => ({
          partnerCode: p.partnerCode,
          firstName: p.firstName || "",
          lastName: p.lastName || "",
          mobilePhone: p.mobilePhone || null,
          companyName: p.companyName || null,
        }));
        setPartners(list);
        setPartnersLoaded(true);
      })
      .catch(() => setPartnersLoaded(true));
  }, [open, partnersLoaded]);

  // ── Dialer helpers ─────────────────────────────────────────────────────────

  const toE164 = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("+") && /^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  };

  const placeDialedCall = () => {
    const e164 = toE164(dialDigits);
    if (!e164) {
      setErrorMsg("Enter a valid 10-digit US number or +E.164 format.");
      return;
    }
    call(e164);
  };

  const appendDigit = (d: string) => setDialDigits((v) => (v + d).slice(0, 20));

  const filteredPartners = partnerSearch.trim()
    ? partners.filter((p) => {
        const q = partnerSearch.trim().toLowerCase();
        return (
          p.firstName.toLowerCase().startsWith(q) ||
          p.lastName.toLowerCase().startsWith(q) ||
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.partnerCode.toLowerCase().includes(q) ||
          (p.companyName || "").toLowerCase().includes(q)
        );
      })
    : partners.slice(0, 8);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      try { callRef.current?.disconnect?.(); deviceRef.current?.destroy?.(); } catch {}
      stopDurationTimer();
    };
  }, [stopDurationTimer]);

  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Floating trigger button (panel closed) ─────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={async () => { setOpen(true); await ensureDevice(); }}
        title="Open softphone"
        className="fixed bottom-6 right-6 z-[950] bg-gradient-to-br from-brand-gold to-[#e8c060] text-brand-dark rounded-full shadow-lg shadow-brand-gold/20 w-14 h-14 text-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
      >
        📞
      </button>
    );
  }

  const inCall = state === "in-call" || state === "ringing" || state === "connecting";

  // Panel position: use dragged pos if set, otherwise anchor to bottom-right.
  const panelStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 24, bottom: 24 };

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      className="fixed z-[951] w-[340px] max-h-[85vh] bg-[var(--app-bg-secondary)] border border-brand-gold/30 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col"
    >
      {/* ── Header (drag handle) ── */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        className={`flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)] bg-gradient-to-r from-brand-gold/10 to-transparent shrink-0 select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div>
          <div className="font-body text-[11px] uppercase tracking-[1.5px] text-brand-gold flex items-center gap-1.5">
            <span className="text-[var(--app-text-muted)] text-[10px]">⠿</span>
            Softphone
          </div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5">
            {state === "demo" ? "Demo mode — not configured" : state.replace("-", " ")}
          </div>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (inCall) hangup();
            setOpen(false);
          }}
          className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--app-input-bg)] transition-colors"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-5 overflow-y-auto">
        {state === "demo" && (
          <div className="font-body text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
            Softphone is in demo mode. Missing env vars:{" "}
            <span className="font-mono text-[10px] text-yellow-300">
              {missing.join(", ") || "TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID"}
            </span>
          </div>
        )}

        {/* ── IN-CALL VIEW ── */}
        {inCall && (
          <>
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">
                {state === "in-call" ? "📞" : state === "ringing" ? "📲" : "☎️"}
              </div>
              <div className="font-display text-lg font-bold text-[var(--app-text)]">
                {currentName || currentNumber}
              </div>
              {currentNumber && currentName && (
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">{currentNumber}</div>
              )}
              {state === "in-call" && (
                <div className="font-mono text-[13px] text-brand-gold mt-2">{fmtDuration(durationSec)}</div>
              )}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={toggleMute}
                disabled={state !== "in-call"}
                className={`w-12 h-12 rounded-full border transition-colors disabled:opacity-40 ${
                  muted
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                    : "text-[var(--app-text-muted)] border-[var(--app-border)] hover:text-[var(--app-text-secondary)]"
                }`}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇" : "🎙️"}
              </button>
              <button
                onClick={hangup}
                className="w-14 h-14 rounded-full bg-red-500/90 hover:bg-red-500 text-white text-xl shadow-lg shadow-red-500/30 transition-colors"
                title="Hang up"
              >
                ✖
              </button>
            </div>
          </>
        )}

        {/* ── DIALER VIEW ── */}
        {!inCall && (
          <div className="flex flex-col gap-4">
            <div>
              <input
                type="tel"
                value={dialDigits}
                onChange={(e) => setDialDigits(e.target.value)}
                placeholder="(555) 555-5555 or +14155550100"
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-3 text-center font-mono text-[16px] text-[var(--app-text)] outline-none focus:border-brand-gold/40"
              />
              {errorMsg && state !== "error" && (
                <div className="font-body text-[10px] text-red-400 mt-1 text-center">{errorMsg}</div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
                <button
                  key={k}
                  onClick={() => appendDigit(k)}
                  className="h-11 rounded-lg font-display text-[18px] font-bold text-[var(--app-text)] bg-[var(--app-input-bg)] border border-[var(--app-border)] hover:bg-brand-gold/10 hover:border-brand-gold/30 transition-colors active:scale-95"
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDialDigits((v) => v.slice(0, -1))}
                disabled={!dialDigits}
                className="flex-1 h-11 rounded-lg font-body text-[12px] text-[var(--app-text-muted)] bg-[var(--app-input-bg)] border border-[var(--app-border)] hover:text-[var(--app-text-secondary)] disabled:opacity-30 transition-colors"
              >
                ⌫ Delete
              </button>
              <button
                onClick={placeDialedCall}
                disabled={!dialDigits || state === "demo"}
                className="flex-[2] h-11 rounded-lg font-display font-bold text-[13px] bg-gradient-to-br from-brand-gold to-[#e8c060] text-brand-dark shadow-lg shadow-brand-gold/20 hover:scale-[1.01] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 transition-all"
              >
                📞 Call
              </button>
            </div>

            <div className="border-t border-[var(--app-border)] pt-3">
              <input
                type="text"
                value={partnerSearch}
                onChange={(e) => setPartnerSearch(e.target.value)}
                placeholder="🔍 Search partners by name or code..."
                className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 font-body text-[12px] text-[var(--app-text)] outline-none focus:border-brand-gold/40 mb-2"
              />
              <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {filteredPartners.length === 0 && (
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] text-center py-3">
                    {partnersLoaded ? "No partners match." : "Loading partners..."}
                  </div>
                )}
                {filteredPartners.map((p) => (
                  <button
                    key={p.partnerCode}
                    onClick={() => {
                      if (!p.mobilePhone) {
                        setErrorMsg(`${p.firstName} ${p.lastName} has no mobile number on file.`);
                        return;
                      }
                      call(p.mobilePhone, `${p.firstName} ${p.lastName}`.trim());
                    }}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-brand-gold/10 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[12px] font-medium text-[var(--app-text)] truncate">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)] truncate">
                        {p.mobilePhone || "no mobile"} · {p.partnerCode}
                      </div>
                    </div>
                    <span className="text-[13px] shrink-0">{p.mobilePhone ? "📞" : "⦸"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="font-body text-[10px] text-[var(--app-text-faint)] text-center">
              {state === "ready" && "Type a number or pick a partner to call."}
              {state === "ended" && "Last call ended. Dial another number."}
              {state === "idle" && "Initializing device..."}
              {state === "error" && (errorMsg || "Error — try again.")}
              {state === "demo" && "Demo mode — UI preview only."}
              {state === "registering" && "Connecting to Twilio..."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
