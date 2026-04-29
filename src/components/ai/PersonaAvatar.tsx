"use client";

import Image from "next/image";
import { PERSONAS, resolvePersonaId } from "@/lib/ai-personas";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 24, md: 36, lg: 56 };

export default function PersonaAvatar({
  personaId,
  size = "md",
  showName = true,
  showTagline = false,
  className = "",
}: {
  personaId: string | null | undefined;
  size?: Size;
  showName?: boolean;
  showTagline?: boolean;
  className?: string;
}) {
  const resolved = resolvePersonaId(personaId);
  const persona = PERSONAS[resolved];
  const px = SIZE_PX[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src={persona.avatarSrc}
        alt={persona.displayName}
        width={px}
        height={px}
        className="rounded-full flex-shrink-0"
        style={{ width: px, height: px }}
      />
      {(showName || showTagline) && (
        <div className="flex flex-col min-w-0">
          {showName && (
            <span
              className={`font-body font-semibold leading-tight ${size === "lg" ? "text-[16px]" : "text-[12px]"}`}
              style={{ color: persona.accentHex }}
            >
              {persona.displayName}
            </span>
          )}
          {showTagline && (
            <span className={`font-body text-[var(--app-text-muted)] leading-tight truncate ${size === "lg" ? "text-[13px]" : "text-[10px]"}`}>
              {persona.tagline}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
