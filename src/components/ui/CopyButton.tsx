"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  color = "#c4a050",
}: {
  text: string;
  color?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="font-body text-[11px] tracking-[1px] uppercase px-4 py-3 rounded-md cursor-pointer transition-all shrink-0 whitespace-nowrap min-h-[44px] min-w-[44px]"
      style={{
        background: copied ? color + "22" : "none",
        border: `1px solid ${color}66`,
        color: copied ? "#22c55e" : color,
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
