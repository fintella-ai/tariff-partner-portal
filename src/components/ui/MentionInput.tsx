// src/components/ui/MentionInput.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Admin = { email: string; name: string | null; role?: string };
type Deal = { id: string; dealName: string };

export type MentionInputProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function MentionInput({ value, onChange, onSubmit, placeholder = "Type a message... @name to mention, #deal to tag", disabled }: MentionInputProps) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [popover, setPopover] = useState<{ type: "admin" | "deal"; query: string; pos: number } | null>(null);
  const [popIndex, setPopIndex] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Fetch admin list once; 5-minute client cache handled by HTTP cache headers upstream
  useEffect(() => {
    fetch("/api/admin/team-chat/admins")
      .then((r) => r.json())
      .then((d) => setAdmins(d.admins || []))
      .catch(() => {});
  }, []);

  // Fetch deals on demand when the # popover opens (lazy)
  const loadDeals = useCallback(async () => {
    if (deals.length > 0) return;
    try {
      const r = await fetch("/api/admin/deals");
      if (r.ok) {
        const d = await r.json();
        setDeals((d.deals || []).map((x: any) => ({ id: x.id, dealName: x.dealName })));
      }
    } catch {}
  }, [deals.length]);

  // Detect trigger tokens in content
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = value.slice(0, cursor);
    const atMatch = /(?:^|\s)@([A-Za-z]*)$/.exec(before);
    const hashMatch = /(?:^|\s)#([A-Za-z0-9]*)$/.exec(before);
    if (atMatch) {
      setPopover({ type: "admin", query: atMatch[1].toLowerCase(), pos: cursor - atMatch[1].length - 1 });
      setPopIndex(0);
    } else if (hashMatch) {
      setPopover({ type: "deal", query: hashMatch[1].toLowerCase(), pos: cursor - hashMatch[1].length - 1 });
      setPopIndex(0);
      loadDeals();
    } else {
      setPopover(null);
    }
  }, [value, loadDeals]);

  const filteredAdmins = admins
    .filter((a) => (a.name || a.email).toLowerCase().includes(popover?.query ?? ""))
    .slice(0, 6);
  const filteredDeals = deals
    .filter((d) => d.dealName.toLowerCase().includes(popover?.query ?? ""))
    .slice(0, 6);
  const list = popover?.type === "admin" ? filteredAdmins : popover?.type === "deal" ? filteredDeals : [];

  const insertToken = (token: string) => {
    if (!popover) return;
    const before = value.slice(0, popover.pos);
    const after = value.slice(taRef.current?.selectionStart ?? popover.pos);
    const next = before + token + after;
    onChange(next);
    setPopover(null);
    setTimeout(() => {
      const newPos = (before + token).length;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popover && list.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPopIndex((i) => (i + 1) % list.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setPopIndex((i) => (i - 1 + list.length) % list.length); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const pick = list[popIndex] as any;
        if (popover.type === "admin") insertToken(`@[${pick.name || pick.email}](${pick.email})`);
        else insertToken(`[deal:${pick.id}]`);
        return;
      }
      if (e.key === "Escape") { setPopover(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-xl px-4 py-3 text-[var(--app-text)] font-body text-[13px] outline-none focus:border-brand-gold/30 transition-colors placeholder:text-[var(--app-text-muted)] resize-none"
      />
      {popover && list.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 w-full max-w-[320px] bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-xl shadow-xl shadow-black/30 overflow-hidden z-10">
          {list.map((item: any, i: number) => (
            <button
              key={popover.type === "admin" ? item.email : item.id}
              onClick={() => popover.type === "admin" ? insertToken(`@[${item.name || item.email}](${item.email})`) : insertToken(`[deal:${item.id}]`)}
              className={`w-full text-left px-3 py-2 font-body text-[12px] transition-colors ${i === popIndex ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text)] hover:bg-[var(--app-card-bg)]"}`}
            >
              {popover.type === "admin" ? (item.name || item.email) : item.dealName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
