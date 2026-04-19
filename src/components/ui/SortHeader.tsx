"use client";

import type { SortDir } from "@/lib/sortRows";

export type { SortDir };

export type SortHeaderProps = {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: SortDir;
  onSort: (key: string) => void;
};

export default function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: SortHeaderProps) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 font-body text-[10px] tracking-[1px] uppercase theme-text-muted hover:text-brand-gold transition-colors text-left"
    >
      {label}
      <span className={`text-[8px] flex flex-col leading-none ${isActive ? "text-brand-gold" : "theme-text-faint"}`}>
        <span className={isActive && currentDir === "asc" ? "text-brand-gold" : ""}>&#9650;</span>
        <span className={isActive && currentDir === "desc" ? "text-brand-gold" : ""}>&#9660;</span>
      </span>
    </button>
  );
}
