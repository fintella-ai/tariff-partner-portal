"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { PERSONAS, type PersonaId } from "@/lib/ai-personas";

const DISPLAY_ORDER: PersonaId[] = ["finn", "stella", "tara", "ollie"];

const PERSONA_TIPS: Record<PersonaId, string> = {
  finn: "Fast answers, deal lookups, commission data",
  stella: "Coaching, onboarding guidance, warm support",
  tara: "Tariff refund expert, cites training sources",
  ollie: "Bug triage, IT escalation, live transfers",
};

interface Props {
  active: PersonaId;
  onSwitch: (id: PersonaId) => void;
  size?: number;
}

function Tooltip({ anchorEl, persona }: { anchorEl: HTMLElement; persona: PersonaId }) {
  const p = PERSONAS[persona];
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const measure = useCallback(() => {
    const rect = anchorEl.getBoundingClientRect();
    setPos({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
  }, [anchorEl]);

  useEffect(() => {
    measure();
  }, [measure]);

  if (!pos) return null;

  return createPortal(
    <div
      className="fixed pointer-events-none whitespace-nowrap px-2.5 py-1.5 rounded-lg shadow-lg"
      style={{
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
        background: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11px]">💡</span>
        <span className="font-display text-[11px] font-semibold" style={{ color: p.accentHex }}>
          {p.displayName}
        </span>
      </div>
      <p className="font-body text-[10px] text-[var(--app-text-secondary)] mt-0.5">
        {PERSONA_TIPS[persona]}
      </p>
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 -mt-1"
        style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)", borderTop: "none", borderLeft: "none" }}
      />
    </div>,
    document.body
  );
}

export default function PersonaSwitcherRow({ active, onSwitch, size = 28 }: Props) {
  const [hoveredId, setHoveredId] = useState<PersonaId | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div className="flex items-center gap-1.5">
      {DISPLAY_ORDER.map((id) => {
        const persona = PERSONAS[id];
        const isActive = id === active;
        return (
          <div key={id}>
            <button
              ref={(el) => { buttonRefs.current[id] = el; }}
              type="button"
              onClick={() => onSwitch(id)}
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`rounded-full transition-all duration-200 flex-shrink-0 ${
                isActive ? "scale-110" : "opacity-60 hover:opacity-100"
              }`}
              style={{
                width: size + 8,
                height: size + 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...(isActive
                  ? {
                      boxShadow: `0 0 0 2px ${persona.accentHex}`,
                      borderRadius: "9999px",
                    }
                  : {}),
              }}
            >
              <Image
                src={persona.avatarSrc}
                alt={persona.displayName}
                width={size}
                height={size}
                className="rounded-full flex-shrink-0"
                style={{ width: size, height: size }}
              />
            </button>

            {hoveredId === id && buttonRefs.current[id] && (
              <Tooltip anchorEl={buttonRefs.current[id]!} persona={id} />
            )}
          </div>
        );
      })}
    </div>
  );
}
