"use client";

import { useState } from "react";
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

export default function PersonaSwitcherRow({ active, onSwitch, size = 28 }: Props) {
  const [hoveredId, setHoveredId] = useState<PersonaId | null>(null);

  return (
    <div className="flex items-center gap-1.5 relative">
      {DISPLAY_ORDER.map((id) => {
        const persona = PERSONAS[id];
        const isActive = id === active;
        return (
          <div key={id} className="relative">
            <button
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

            {hoveredId === id && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none whitespace-nowrap z-50"
                style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]">💡</span>
                  <span className="font-display text-[11px] font-semibold" style={{ color: persona.accentHex }}>
                    {persona.displayName}
                  </span>
                </div>
                <p className="font-body text-[10px] text-[var(--app-text-secondary)] mt-0.5">
                  {PERSONA_TIPS[id]}
                </p>
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 -mt-1"
                  style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)", borderTop: "none", borderLeft: "none" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
