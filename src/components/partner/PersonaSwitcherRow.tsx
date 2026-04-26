"use client";

import Image from "next/image";
import { PERSONAS, type PersonaId } from "@/lib/ai-personas";

const DISPLAY_ORDER: PersonaId[] = ["finn", "stella", "tara", "ollie"];

interface Props {
  active: PersonaId;
  onSwitch: (id: PersonaId) => void;
  size?: number;
}

export default function PersonaSwitcherRow({ active, onSwitch, size = 28 }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {DISPLAY_ORDER.map((id) => {
        const persona = PERSONAS[id];
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSwitch(id)}
            title={`${persona.displayName} — ${persona.tagline}`}
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
        );
      })}
    </div>
  );
}
