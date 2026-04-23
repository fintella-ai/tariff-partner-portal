// src/components/ui/MentionInput.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Admin = { email: string; name: string | null; role?: string };
type Deal = { id: string; dealName: string };
type Partner = { partnerCode: string; firstName: string; lastName: string; tier?: string };

export type MentionInputProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function MentionInput({ value, onChange, onSubmit, placeholder = "Type a message... @name, #deal, &partner", disabled }: MentionInputProps) {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [popover, setPopover] = useState<{ type: "admin" | "deal" | "partner"; query: string; pos: number } | null>(null);
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

  // Fetch partners on demand when the & popover opens (lazy)
  const loadPartners = useCallback(async () => {
    if (partners.length > 0) return;
    try {
      const r = await fetch("/api/admin/partners");
      if (r.ok) {
        const d = await r.json();
        setPartners(
          (d.partners || []).map((p: any) => ({
            partnerCode: p.partnerCode,
            firstName: p.firstName,
            lastName: p.lastName,
            tier: p.tier,
          }))
        );
      }
    } catch {}
  }, [partners.length]);

  // Detect trigger tokens in content
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = value.slice(0, cursor);
    const atMatch = /(?:^|\s)@([A-Za-z]*)$/.exec(before);
    const hashMatch = /(?:^|\s)#([A-Za-z0-9]*)$/.exec(before);
    const ampMatch = /(?:^|\s)&([A-Za-z0-9_-]*)$/.exec(before);
    if (atMatch) {
      setPopover({ type: "admin", query: atMatch[1].toLowerCase(), pos: cursor - atMatch[1].length - 1 });
      setPopIndex(0);
    } else if (hashMatch) {
      setPopover({ type: "deal", query: hashMatch[1].toLowerCase(), pos: cursor - hashMatch[1].length - 1 });
      setPopIndex(0);
      loadDeals();
    } else if (ampMatch) {
      setPopover({ type: "partner", query: ampMatch[1].toLowerCase(), pos: cursor - ampMatch[1].length - 1 });
      setPopIndex(0);
      loadPartners();
    } else {
      setPopover(null);
    }
  }, [value, loadDeals, loadPartners]);

  const filteredAdmins = admins
    .filter((a) => (a.name || a.email).toLowerCase().includes(popover?.query ?? ""))
    .slice(0, 6);
  const filteredDeals = deals
    .filter((d) => d.dealName.toLowerCase().includes(popover?.query ?? ""))
    .slice(0, 6);
  const filteredPartners = partners
    .filter((p) => {
      const q = popover?.query ?? "";
      return (
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.partnerCode.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);
  const list: any[] =
    popover?.type === "admin"
      ? filteredAdmins
      : popover?.type === "deal"
        ? filteredDeals
        : popover?.type === "partner"
          ? filteredPartners
          : [];

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

  const pickToken = (item: any): string => {
    if (popover?.type === "admin") return `@[${item.name || item.email}](${item.email})`;
    if (popover?.type === "deal") return `[deal:${item.id}]`;
    if (popover?.type === "partner") return `[partner:${item.partnerCode}]`;
    return "";
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popover && list.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPopIndex((i) => (i + 1) % list.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setPopIndex((i) => (i - 1 + list.length) % list.length); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        insertToken(pickToken(list[popIndex]));
        return;
      }
      if (e.key === "Escape") { setPopover(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const renderLabel = (item: any) => {
    if (popover?.type === "admin") return item.name || item.email;
    if (popover?.type === "deal") return item.dealName;
    if (popover?.type === "partner") return `${item.firstName} ${item.lastName} · ${item.partnerCode}`;
    return "";
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
        <div className="absolute bottom-full mb-2 left-0 w-full max-w-[320px] bg-[var(--app-popover-bg)] border border-[var(--app-border)] rounded-xl shadow-xl shadow-black/30 overflow-hidden z-10">
          {list.map((item: any, i: number) => (
            <button
              key={popover.type === "admin" ? item.email : popover.type === "deal" ? item.id : item.partnerCode}
              onClick={() => insertToken(pickToken(item))}
              className={`w-full text-left px-3 py-2 font-body text-[12px] transition-colors ${i === popIndex ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text)] hover:bg-[var(--app-card-bg)]"}`}
            >
              {renderLabel(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
