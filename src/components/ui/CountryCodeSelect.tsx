"use client";

import { useState, useRef, useEffect } from "react";

export type CountryCode = {
  code: string;
  dial: string;
  flag: string;
  name: string;
};

const COUNTRIES: CountryCode[] = [
  { code: "US", dial: "+1", flag: "\u{1F1FA}\u{1F1F8}", name: "United States" },
  { code: "CA", dial: "+1", flag: "\u{1F1E8}\u{1F1E6}", name: "Canada" },
  { code: "GB", dial: "+44", flag: "\u{1F1EC}\u{1F1E7}", name: "United Kingdom" },
  { code: "AU", dial: "+61", flag: "\u{1F1E6}\u{1F1FA}", name: "Australia" },
  { code: "DE", dial: "+49", flag: "\u{1F1E9}\u{1F1EA}", name: "Germany" },
  { code: "FR", dial: "+33", flag: "\u{1F1EB}\u{1F1F7}", name: "France" },
  { code: "IT", dial: "+39", flag: "\u{1F1EE}\u{1F1F9}", name: "Italy" },
  { code: "ES", dial: "+34", flag: "\u{1F1EA}\u{1F1F8}", name: "Spain" },
  { code: "MX", dial: "+52", flag: "\u{1F1F2}\u{1F1FD}", name: "Mexico" },
  { code: "BR", dial: "+55", flag: "\u{1F1E7}\u{1F1F7}", name: "Brazil" },
  { code: "IN", dial: "+91", flag: "\u{1F1EE}\u{1F1F3}", name: "India" },
  { code: "CN", dial: "+86", flag: "\u{1F1E8}\u{1F1F3}", name: "China" },
  { code: "JP", dial: "+81", flag: "\u{1F1EF}\u{1F1F5}", name: "Japan" },
  { code: "KR", dial: "+82", flag: "\u{1F1F0}\u{1F1F7}", name: "South Korea" },
  { code: "IL", dial: "+972", flag: "\u{1F1EE}\u{1F1F1}", name: "Israel" },
  { code: "AE", dial: "+971", flag: "\u{1F1E6}\u{1F1EA}", name: "UAE" },
  { code: "SG", dial: "+65", flag: "\u{1F1F8}\u{1F1EC}", name: "Singapore" },
  { code: "HK", dial: "+852", flag: "\u{1F1ED}\u{1F1F0}", name: "Hong Kong" },
  { code: "NZ", dial: "+64", flag: "\u{1F1F3}\u{1F1FF}", name: "New Zealand" },
  { code: "PH", dial: "+63", flag: "\u{1F1F5}\u{1F1ED}", name: "Philippines" },
  { code: "VN", dial: "+84", flag: "\u{1F1FB}\u{1F1F3}", name: "Vietnam" },
  { code: "TH", dial: "+66", flag: "\u{1F1F9}\u{1F1ED}", name: "Thailand" },
  { code: "NL", dial: "+31", flag: "\u{1F1F3}\u{1F1F1}", name: "Netherlands" },
  { code: "SE", dial: "+46", flag: "\u{1F1F8}\u{1F1EA}", name: "Sweden" },
  { code: "CH", dial: "+41", flag: "\u{1F1E8}\u{1F1ED}", name: "Switzerland" },
  { code: "IE", dial: "+353", flag: "\u{1F1EE}\u{1F1EA}", name: "Ireland" },
  { code: "CO", dial: "+57", flag: "\u{1F1E8}\u{1F1F4}", name: "Colombia" },
  { code: "AR", dial: "+54", flag: "\u{1F1E6}\u{1F1F7}", name: "Argentina" },
  { code: "CL", dial: "+56", flag: "\u{1F1E8}\u{1F1F1}", name: "Chile" },
  { code: "NG", dial: "+234", flag: "\u{1F1F3}\u{1F1EC}", name: "Nigeria" },
];

/**
 * Parse a full mobile phone value like "+44 7911123456" into
 * { countryCode: "GB", phoneNumber: "7911123456" }
 */
export function parseMobilePhone(value: string): { countryCode: string; phoneNumber: string } {
  if (!value) return { countryCode: "US", phoneNumber: "" };

  const trimmed = value.trim();
  // Try matching longest dial codes first
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (trimmed.startsWith(c.dial)) {
      return { countryCode: c.code, phoneNumber: trimmed.slice(c.dial.length).trim() };
    }
  }
  return { countryCode: "US", phoneNumber: trimmed.replace(/^\+?1?\s*/, "") };
}

/**
 * Build the full mobile phone string from country code + number
 */
export function buildMobilePhone(countryCode: string, phoneNumber: string): string {
  if (!phoneNumber) return "";
  const country = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];
  return `${country.dial} ${phoneNumber}`;
}

export function getCountries() {
  return COUNTRIES;
}

interface Props {
  selectedCode: string;
  onChange: (code: string) => void;
}

export default function CountryCodeSelect({ selectedCode, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.code === selectedCode) || COUNTRIES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 theme-input rounded-lg px-2.5 py-3 font-body text-sm hover:border-brand-gold/40 transition-colors min-h-[44px] h-full min-w-[85px] sm:min-w-[100px]"
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="theme-text-secondary">{selected.dial}</span>
        <svg className={`w-3 h-3 theme-text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-[min(240px,85vw)] max-h-[240px] overflow-y-auto rounded-lg shadow-xl z-50" style={{ background: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => { onChange(c.code); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left font-body text-[13px] theme-hover transition-colors min-h-[44px] ${
                c.code === selectedCode ? "bg-brand-gold/10 text-brand-gold" : "theme-text-secondary"
              }`}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span className="flex-1">{c.name}</span>
              <span className="theme-text-muted text-[12px]">{c.dial}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
