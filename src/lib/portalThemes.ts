/**
 * Portal theme presets.
 *
 * Each theme defines per-mode overrides for the CSS variables declared in
 * `src/app/globals.css`. The "default" theme uses empty objects — selecting
 * it is a no-op and the baseline globals.css values apply, which is how we
 * guarantee rollback to "exactly how the portal looks today."
 *
 * Theme application happens at runtime: `ThemeProvider` injects a <style>
 * block with the selected theme's variables scoped to
 * `[data-theme="light"]` / `[data-theme="dark"]`. Because the style tag is
 * appended AFTER globals.css, its rules override the baseline via natural
 * cascade order. Switching themes is a single `textContent` replacement.
 *
 * Adding a new theme: copy an existing entry, give it a unique `id`, pick
 * a vibe + tagline, and fill in the light / dark override maps. Only
 * variables you want to change need to appear — anything you omit keeps
 * its global default so themes never silently break other surfaces.
 */

export type ThemeVars = {
  /* page + panel backgrounds */
  "--app-bg"?: string;
  "--app-bg-secondary"?: string;
  "--app-header-bg"?: string;

  /* text */
  "--app-text"?: string;
  "--app-text-secondary"?: string;
  "--app-text-muted"?: string;
  "--app-text-faint"?: string;

  /* borders */
  "--app-border"?: string;
  "--app-border-subtle"?: string;

  /* surfaces */
  "--app-card-bg"?: string;
  "--app-card-border"?: string;
  "--app-popover-bg"?: string;

  /* form controls */
  "--app-input-bg"?: string;
  "--app-input-border"?: string;
  "--app-input-text"?: string;
  "--app-input-placeholder"?: string;

  /* sidebar */
  "--app-sidebar-bg"?: string;
  "--app-sidebar-border"?: string;

  /* interactions */
  "--app-hover"?: string;
  "--app-overlay"?: string;

  /* brand accents */
  "--app-gold"?: string;
  "--app-gold-text"?: string;
  "--brand-gold"?: string;
  "--brand-gold-muted"?: string;

  /* misc */
  "--app-code-bg"?: string;
  "--app-scrollbar"?: string;
};

export type PortalTheme = {
  id: string;
  name: string;
  vibe: string;        // one-line descriptor used in the picker subtitle
  preview: {
    // Solid colors used to render the mini-thumbnail card. Kept separate
    // from the full `light`/`dark` maps so the thumbnail doesn't have to
    // match every surface — it's just "what does this theme feel like."
    bg: string;
    card: string;
    sidebar: string;
    accent: string;
    text: string;
    textMuted: string;
    border: string;
  };
  light: ThemeVars;
  dark: ThemeVars;
};

// ─────────────────────────────────────────────────────────────────────────
// 1. DEFAULT — baseline globals.css values. Empty overrides = no-op. The
//    thumbnail preview still renders because `preview` has solid colors.
// ─────────────────────────────────────────────────────────────────────────
const defaultTheme: PortalTheme = {
  id: "default",
  name: "Default",
  vibe: "The current portal look — preserved exactly.",
  preview: {
    bg: "#080d1c",
    card: "rgba(255,255,255,0.10)",
    sidebar: "#000000",
    accent: "#c4a050",
    text: "rgba(255,255,255,0.96)",
    textMuted: "rgba(255,255,255,0.72)",
    border: "rgba(255,255,255,0.22)",
  },
  light: {},
  dark: {},
};

// ─────────────────────────────────────────────────────────────────────────
// 2. ARCTIC PROFESSIONAL — Crisp blues + whites. Very high contrast.
// ─────────────────────────────────────────────────────────────────────────
const arcticProfessional: PortalTheme = {
  id: "arctic-professional",
  name: "Arctic Professional",
  vibe: "Crisp blues + whites. High-contrast, boardroom-ready.",
  preview: {
    bg: "#0b1b2e",
    card: "#13253b",
    sidebar: "#071526",
    accent: "#3b82f6",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.70)",
    border: "rgba(59,130,246,0.28)",
  },
  light: {
    "--app-bg": "#eef3f9",
    "--app-bg-secondary": "#ffffff",
    "--app-header-bg": "#dde7f3",
    "--app-text": "#0b1b2e",
    "--app-text-secondary": "#1e3a5f",
    "--app-text-muted": "#3a5275",
    "--app-border": "#b7c9de",
    "--app-border-subtle": "#d6e0ed",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#b7c9de",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#f3f6fb",
    "--app-input-border": "#8a9cb4",
    "--app-sidebar-bg": "#0b1b2e",
    "--app-sidebar-border": "rgba(59,130,246,0.30)",
    "--brand-gold": "#1d4ed8",
    "--brand-gold-muted": "rgba(29,78,216,0.14)",
    "--app-gold": "#1d4ed8",
    "--app-gold-text": "#1d4ed8",
  },
  dark: {
    "--app-bg": "#071526",
    "--app-bg-secondary": "#0b1b2e",
    "--app-header-bg": "#050f1d",
    "--app-text": "rgba(255,255,255,0.98)",
    "--app-text-secondary": "rgba(255,255,255,0.85)",
    "--app-text-muted": "rgba(198,220,245,0.78)",
    "--app-border": "rgba(118,179,255,0.22)",
    "--app-border-subtle": "rgba(118,179,255,0.12)",
    "--app-card-bg": "rgba(59,130,246,0.10)",
    "--app-card-border": "rgba(59,130,246,0.28)",
    "--app-popover-bg": "#13253b",
    "--app-input-bg": "rgba(59,130,246,0.14)",
    "--app-input-border": "rgba(118,179,255,0.34)",
    "--app-sidebar-bg": "#050f1d",
    "--app-sidebar-border": "rgba(59,130,246,0.28)",
    "--brand-gold": "#60a5fa",
    "--brand-gold-muted": "rgba(96,165,250,0.18)",
    "--app-gold": "#60a5fa",
    "--app-gold-text": "#60a5fa",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 3. OBSIDIAN PRO — Pure black / pure white. Maximum contrast, minimal.
// ─────────────────────────────────────────────────────────────────────────
const obsidianPro: PortalTheme = {
  id: "obsidian-pro",
  name: "Obsidian Pro",
  vibe: "Pure black, razor-sharp text. Max-contrast minimalism.",
  preview: {
    bg: "#000000",
    card: "#0d0d0d",
    sidebar: "#000000",
    accent: "#ffffff",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.78)",
    border: "rgba(255,255,255,0.30)",
  },
  light: {
    "--app-bg": "#ffffff",
    "--app-bg-secondary": "#f5f5f5",
    "--app-header-bg": "#ebebeb",
    "--app-text": "#000000",
    "--app-text-secondary": "#1a1a1a",
    "--app-text-muted": "#333333",
    "--app-border": "#000000",
    "--app-border-subtle": "#cccccc",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#000000",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#ffffff",
    "--app-input-border": "#000000",
    "--app-sidebar-bg": "#000000",
    "--app-sidebar-border": "#000000",
    "--brand-gold": "#000000",
    "--brand-gold-muted": "rgba(0,0,0,0.08)",
    "--app-gold": "#000000",
    "--app-gold-text": "#000000",
  },
  dark: {
    "--app-bg": "#000000",
    "--app-bg-secondary": "#060606",
    "--app-header-bg": "#000000",
    "--app-text": "#ffffff",
    "--app-text-secondary": "rgba(255,255,255,0.90)",
    "--app-text-muted": "rgba(255,255,255,0.78)",
    "--app-border": "rgba(255,255,255,0.30)",
    "--app-border-subtle": "rgba(255,255,255,0.16)",
    "--app-card-bg": "#0d0d0d",
    "--app-card-border": "rgba(255,255,255,0.26)",
    "--app-popover-bg": "#0d0d0d",
    "--app-input-bg": "#1a1a1a",
    "--app-input-border": "rgba(255,255,255,0.34)",
    "--app-sidebar-bg": "#000000",
    "--app-sidebar-border": "rgba(255,255,255,0.22)",
    "--brand-gold": "#ffffff",
    "--brand-gold-muted": "rgba(255,255,255,0.14)",
    "--app-gold": "#ffffff",
    "--app-gold-text": "#ffffff",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 4. SLATE MODERN — Neutral grays with indigo accent. Clean + flexible.
// ─────────────────────────────────────────────────────────────────────────
const slateModern: PortalTheme = {
  id: "slate-modern",
  name: "Slate Modern",
  vibe: "Neutral slate with indigo accents. Understated, modern.",
  preview: {
    bg: "#11151c",
    card: "#1a212d",
    sidebar: "#0b0f16",
    accent: "#818cf8",
    text: "rgba(241,245,249,0.97)",
    textMuted: "rgba(203,213,225,0.78)",
    border: "rgba(148,163,184,0.28)",
  },
  light: {
    "--app-bg": "#f1f5f9",
    "--app-bg-secondary": "#ffffff",
    "--app-header-bg": "#e2e8f0",
    "--app-text": "#0f172a",
    "--app-text-secondary": "#1e293b",
    "--app-text-muted": "#475569",
    "--app-border": "#cbd5e1",
    "--app-border-subtle": "#e2e8f0",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#cbd5e1",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#f8fafc",
    "--app-input-border": "#94a3b8",
    "--app-sidebar-bg": "#1e293b",
    "--app-sidebar-border": "rgba(129,140,248,0.30)",
    "--brand-gold": "#4f46e5",
    "--brand-gold-muted": "rgba(79,70,229,0.14)",
    "--app-gold": "#4f46e5",
    "--app-gold-text": "#4f46e5",
  },
  dark: {
    "--app-bg": "#11151c",
    "--app-bg-secondary": "#161b24",
    "--app-header-bg": "#0b0f16",
    "--app-text": "rgba(241,245,249,0.97)",
    "--app-text-secondary": "rgba(226,232,240,0.85)",
    "--app-text-muted": "rgba(203,213,225,0.72)",
    "--app-border": "rgba(148,163,184,0.24)",
    "--app-border-subtle": "rgba(148,163,184,0.14)",
    "--app-card-bg": "#1a212d",
    "--app-card-border": "rgba(148,163,184,0.28)",
    "--app-popover-bg": "#1e293b",
    "--app-input-bg": "#1e293b",
    "--app-input-border": "rgba(148,163,184,0.30)",
    "--app-sidebar-bg": "#0b0f16",
    "--app-sidebar-border": "rgba(129,140,248,0.26)",
    "--brand-gold": "#818cf8",
    "--brand-gold-muted": "rgba(129,140,248,0.18)",
    "--app-gold": "#818cf8",
    "--app-gold-text": "#818cf8",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 5. EMERALD FINANCE — Green financial vibe. Modern fintech.
// ─────────────────────────────────────────────────────────────────────────
const emeraldFinance: PortalTheme = {
  id: "emerald-finance",
  name: "Emerald Finance",
  vibe: "Money green on charcoal. Clean modern fintech.",
  preview: {
    bg: "#0a1410",
    card: "#0f1d17",
    sidebar: "#050b08",
    accent: "#10b981",
    text: "rgba(236,253,245,0.97)",
    textMuted: "rgba(167,243,208,0.78)",
    border: "rgba(16,185,129,0.28)",
  },
  light: {
    "--app-bg": "#ecfdf5",
    "--app-bg-secondary": "#ffffff",
    "--app-header-bg": "#d1fae5",
    "--app-text": "#064e3b",
    "--app-text-secondary": "#065f46",
    "--app-text-muted": "#047857",
    "--app-border": "#a7f3d0",
    "--app-border-subtle": "#d1fae5",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#a7f3d0",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#ecfdf5",
    "--app-input-border": "#6ee7b7",
    "--app-sidebar-bg": "#064e3b",
    "--app-sidebar-border": "rgba(16,185,129,0.40)",
    "--brand-gold": "#059669",
    "--brand-gold-muted": "rgba(5,150,105,0.14)",
    "--app-gold": "#047857",
    "--app-gold-text": "#047857",
  },
  dark: {
    "--app-bg": "#0a1410",
    "--app-bg-secondary": "#0f1d17",
    "--app-header-bg": "#050b08",
    "--app-text": "rgba(236,253,245,0.97)",
    "--app-text-secondary": "rgba(209,250,229,0.85)",
    "--app-text-muted": "rgba(167,243,208,0.74)",
    "--app-border": "rgba(16,185,129,0.26)",
    "--app-border-subtle": "rgba(16,185,129,0.14)",
    "--app-card-bg": "rgba(16,185,129,0.08)",
    "--app-card-border": "rgba(16,185,129,0.28)",
    "--app-popover-bg": "#14281f",
    "--app-input-bg": "rgba(16,185,129,0.10)",
    "--app-input-border": "rgba(16,185,129,0.32)",
    "--app-sidebar-bg": "#050b08",
    "--app-sidebar-border": "rgba(16,185,129,0.30)",
    "--brand-gold": "#10b981",
    "--brand-gold-muted": "rgba(16,185,129,0.18)",
    "--app-gold": "#10b981",
    "--app-gold-text": "#10b981",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 6. MIDNIGHT TERMINAL — Financial terminal vibe. Green on deep navy.
// ─────────────────────────────────────────────────────────────────────────
const midnightTerminal: PortalTheme = {
  id: "midnight-terminal",
  name: "Midnight Terminal",
  vibe: "Bloomberg terminal energy — green on deep navy.",
  preview: {
    bg: "#050814",
    card: "#0a1028",
    sidebar: "#020510",
    accent: "#22d3ee",
    text: "rgba(224,242,254,0.96)",
    textMuted: "rgba(125,211,252,0.74)",
    border: "rgba(34,211,238,0.24)",
  },
  light: {
    "--app-bg": "#e0f2fe",
    "--app-bg-secondary": "#ffffff",
    "--app-header-bg": "#bae6fd",
    "--app-text": "#0c4a6e",
    "--app-text-secondary": "#075985",
    "--app-text-muted": "#0369a1",
    "--app-border": "#7dd3fc",
    "--app-border-subtle": "#bae6fd",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#7dd3fc",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#f0f9ff",
    "--app-input-border": "#38bdf8",
    "--app-sidebar-bg": "#0c4a6e",
    "--app-sidebar-border": "rgba(34,211,238,0.36)",
    "--brand-gold": "#0891b2",
    "--brand-gold-muted": "rgba(8,145,178,0.14)",
    "--app-gold": "#0e7490",
    "--app-gold-text": "#0e7490",
  },
  dark: {
    "--app-bg": "#050814",
    "--app-bg-secondary": "#080c1d",
    "--app-header-bg": "#020510",
    "--app-text": "rgba(224,242,254,0.98)",
    "--app-text-secondary": "rgba(186,230,253,0.88)",
    "--app-text-muted": "rgba(125,211,252,0.74)",
    "--app-border": "rgba(34,211,238,0.24)",
    "--app-border-subtle": "rgba(34,211,238,0.12)",
    "--app-card-bg": "#0a1028",
    "--app-card-border": "rgba(34,211,238,0.26)",
    "--app-popover-bg": "#0e1534",
    "--app-input-bg": "rgba(34,211,238,0.10)",
    "--app-input-border": "rgba(34,211,238,0.30)",
    "--app-sidebar-bg": "#020510",
    "--app-sidebar-border": "rgba(34,211,238,0.28)",
    "--brand-gold": "#22d3ee",
    "--brand-gold-muted": "rgba(34,211,238,0.16)",
    "--app-gold": "#22d3ee",
    "--app-gold-text": "#22d3ee",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 7. SUNSET VIBRANT — Warm oranges + pinks. Energetic.
// ─────────────────────────────────────────────────────────────────────────
const sunsetVibrant: PortalTheme = {
  id: "sunset-vibrant",
  name: "Sunset Vibrant",
  vibe: "Warm orange-to-pink gradient accents. Energetic.",
  preview: {
    bg: "#1d0c14",
    card: "#2a1520",
    sidebar: "#120509",
    accent: "#fb7185",
    text: "rgba(255,247,237,0.97)",
    textMuted: "rgba(253,186,116,0.78)",
    border: "rgba(251,113,133,0.32)",
  },
  light: {
    "--app-bg": "#fff7ed",
    "--app-bg-secondary": "#ffffff",
    "--app-header-bg": "#ffedd5",
    "--app-text": "#7c2d12",
    "--app-text-secondary": "#9a3412",
    "--app-text-muted": "#c2410c",
    "--app-border": "#fed7aa",
    "--app-border-subtle": "#ffedd5",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#fed7aa",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#fff7ed",
    "--app-input-border": "#fb923c",
    "--app-sidebar-bg": "#7c2d12",
    "--app-sidebar-border": "rgba(251,113,133,0.36)",
    "--brand-gold": "#e11d48",
    "--brand-gold-muted": "rgba(225,29,72,0.14)",
    "--app-gold": "#be123c",
    "--app-gold-text": "#be123c",
  },
  dark: {
    "--app-bg": "#1d0c14",
    "--app-bg-secondary": "#22101a",
    "--app-header-bg": "#120509",
    "--app-text": "rgba(255,247,237,0.98)",
    "--app-text-secondary": "rgba(253,230,138,0.86)",
    "--app-text-muted": "rgba(253,186,116,0.74)",
    "--app-border": "rgba(251,113,133,0.28)",
    "--app-border-subtle": "rgba(251,113,133,0.14)",
    "--app-card-bg": "rgba(251,113,133,0.10)",
    "--app-card-border": "rgba(251,113,133,0.30)",
    "--app-popover-bg": "#2a1520",
    "--app-input-bg": "rgba(251,113,133,0.12)",
    "--app-input-border": "rgba(251,113,133,0.34)",
    "--app-sidebar-bg": "#120509",
    "--app-sidebar-border": "rgba(251,113,133,0.30)",
    "--brand-gold": "#fb7185",
    "--brand-gold-muted": "rgba(251,113,133,0.18)",
    "--app-gold": "#fb7185",
    "--app-gold-text": "#fb7185",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 8. NEON CYBER — Electric blue + magenta. 3D, vibrant, dimensional.
// ─────────────────────────────────────────────────────────────────────────
const neonCyber: PortalTheme = {
  id: "neon-cyber",
  name: "Neon Cyber",
  vibe: "Electric blues + magenta glow. Vibrant 3D energy.",
  preview: {
    bg: "#07081a",
    card: "#0f1230",
    sidebar: "#03031a",
    accent: "#e879f9",
    text: "rgba(237,234,253,0.97)",
    textMuted: "rgba(196,181,253,0.78)",
    border: "rgba(232,121,249,0.34)",
  },
  light: {
    "--app-bg": "#f5f3ff",
    "--app-bg-secondary": "#ffffff",
    "--app-header-bg": "#ede9fe",
    "--app-text": "#2e1065",
    "--app-text-secondary": "#4c1d95",
    "--app-text-muted": "#6d28d9",
    "--app-border": "#c4b5fd",
    "--app-border-subtle": "#ddd6fe",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#c4b5fd",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#f5f3ff",
    "--app-input-border": "#a78bfa",
    "--app-sidebar-bg": "#2e1065",
    "--app-sidebar-border": "rgba(232,121,249,0.38)",
    "--brand-gold": "#a21caf",
    "--brand-gold-muted": "rgba(162,28,175,0.14)",
    "--app-gold": "#86198f",
    "--app-gold-text": "#86198f",
  },
  dark: {
    "--app-bg": "#07081a",
    "--app-bg-secondary": "#0a0b24",
    "--app-header-bg": "#03031a",
    "--app-text": "rgba(237,234,253,0.98)",
    "--app-text-secondary": "rgba(221,214,254,0.88)",
    "--app-text-muted": "rgba(196,181,253,0.74)",
    "--app-border": "rgba(232,121,249,0.30)",
    "--app-border-subtle": "rgba(232,121,249,0.14)",
    "--app-card-bg": "#0f1230",
    "--app-card-border": "rgba(232,121,249,0.30)",
    "--app-popover-bg": "#141838",
    "--app-input-bg": "rgba(232,121,249,0.10)",
    "--app-input-border": "rgba(232,121,249,0.36)",
    "--app-sidebar-bg": "#03031a",
    "--app-sidebar-border": "rgba(232,121,249,0.32)",
    "--brand-gold": "#e879f9",
    "--brand-gold-muted": "rgba(232,121,249,0.18)",
    "--app-gold": "#e879f9",
    "--app-gold-text": "#e879f9",
  },
};

// ─────────────────────────────────────────────────────────────────────────
// 9. PLATINUM ELITE — Luxe cream / platinum. Refined.
// ─────────────────────────────────────────────────────────────────────────
const platinumElite: PortalTheme = {
  id: "platinum-elite",
  name: "Platinum Elite",
  vibe: "Warm cream, platinum, and silver. Understated luxury.",
  preview: {
    bg: "#1a1a1e",
    card: "#252529",
    sidebar: "#0f0f12",
    accent: "#d4d4d4",
    text: "#f5f5f5",
    textMuted: "rgba(229,229,229,0.74)",
    border: "rgba(212,212,212,0.32)",
  },
  light: {
    "--app-bg": "#faf8f4",
    "--app-bg-secondary": "#ffffff",
    "--app-header-bg": "#f0ece4",
    "--app-text": "#1c1917",
    "--app-text-secondary": "#292524",
    "--app-text-muted": "#57534e",
    "--app-border": "#d6d3d1",
    "--app-border-subtle": "#e7e5e4",
    "--app-card-bg": "#ffffff",
    "--app-card-border": "#d6d3d1",
    "--app-popover-bg": "#ffffff",
    "--app-input-bg": "#faf8f4",
    "--app-input-border": "#a8a29e",
    "--app-sidebar-bg": "#1c1917",
    "--app-sidebar-border": "rgba(180,160,120,0.32)",
    "--brand-gold": "#57534e",
    "--brand-gold-muted": "rgba(87,83,78,0.12)",
    "--app-gold": "#57534e",
    "--app-gold-text": "#57534e",
  },
  dark: {
    "--app-bg": "#1a1a1e",
    "--app-bg-secondary": "#1f1f23",
    "--app-header-bg": "#0f0f12",
    "--app-text": "rgba(245,245,245,0.98)",
    "--app-text-secondary": "rgba(229,229,229,0.88)",
    "--app-text-muted": "rgba(212,212,212,0.74)",
    "--app-border": "rgba(212,212,212,0.26)",
    "--app-border-subtle": "rgba(212,212,212,0.14)",
    "--app-card-bg": "#252529",
    "--app-card-border": "rgba(212,212,212,0.28)",
    "--app-popover-bg": "#2a2a2e",
    "--app-input-bg": "rgba(212,212,212,0.10)",
    "--app-input-border": "rgba(212,212,212,0.30)",
    "--app-sidebar-bg": "#0f0f12",
    "--app-sidebar-border": "rgba(212,212,212,0.24)",
    "--brand-gold": "#d4d4d4",
    "--brand-gold-muted": "rgba(212,212,212,0.16)",
    "--app-gold": "#e5e5e5",
    "--app-gold-text": "#e5e5e5",
  },
};

export const PORTAL_THEMES: PortalTheme[] = [
  defaultTheme,
  arcticProfessional,
  obsidianPro,
  slateModern,
  emeraldFinance,
  midnightTerminal,
  sunsetVibrant,
  neonCyber,
  platinumElite,
];

export function getPortalTheme(id: string | null | undefined): PortalTheme {
  return PORTAL_THEMES.find((t) => t.id === id) || defaultTheme;
}

/**
 * Build the <style> tag body for a given theme. Rules target BOTH
 * [data-theme="light"] and [data-theme="dark"] so light/dark toggling
 * still works within a theme.
 *
 * The "default" theme returns an empty string — selecting it removes the
 * override style block entirely so the baseline globals.css values rule
 * the page unaltered. Critical for the "revert to exactly how it was"
 * requirement.
 */
export function buildThemeCSS(themeId: string): string {
  const theme = getPortalTheme(themeId);
  if (theme.id === "default") return ""; // zero-override no-op

  const render = (mode: "light" | "dark", vars: ThemeVars) => {
    const entries = Object.entries(vars).filter(([, v]) => !!v);
    if (entries.length === 0) return "";
    const body = entries.map(([k, v]) => `  ${k}: ${v};`).join("\n");
    return [
      `[data-theme="${mode}"] {`,
      body,
      `}`,
    ].join("\n");
  };

  return [render("light", theme.light), render("dark", theme.dark)]
    .filter(Boolean)
    .join("\n\n");
}

export const PORTAL_THEME_STYLE_ID = "fintella-portal-theme-override";
export const PORTAL_CUSTOM_STYLE_ID = "fintella-portal-custom-override";

// ─────────────────────────────────────────────────────────────────────────
// Per-admin customizations — layered on top of whatever preset is active.
// ─────────────────────────────────────────────────────────────────────────

export type ThemeCustomizations = {
  /** Overrides --brand-gold / --app-gold with a picked hex. */
  accentColor?: string;
  /** CSS font stack to apply on <body>. See FONT_FAMILY_OPTIONS. */
  fontFamily?: string;
  /** Button + input roundedness. Maps to a --radius variable consumed
   *  by new CSS rules below. */
  buttonStyle?: "rounded" | "pill" | "square";
};

export const FONT_FAMILY_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Inter (default)",    value: `"Inter", system-ui, -apple-system, "Segoe UI", sans-serif` },
  { label: "System Default",     value: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` },
  { label: "Space Grotesk",      value: `"Space Grotesk", "Inter", system-ui, sans-serif` },
  { label: "JetBrains Mono",     value: `"JetBrains Mono", "SF Mono", Menlo, monospace` },
  { label: "Playfair Display",   value: `"Playfair Display", Georgia, serif` },
  { label: "DM Sans",            value: `"DM Sans", "Inter", sans-serif` },
];

export const BUTTON_STYLE_OPTIONS: Array<{ label: string; value: "rounded" | "pill" | "square"; radius: string }> = [
  { label: "Rounded (default)", value: "rounded", radius: "0.5rem" },
  { label: "Pill",              value: "pill",    radius: "999px" },
  { label: "Square",            value: "square",  radius: "0" },
];

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildCustomizationCSS(custom: ThemeCustomizations | null | undefined): string {
  if (!custom) return "";
  const lines: string[] = [];
  const rootLines: string[] = [];

  if (custom.accentColor) {
    const hex = custom.accentColor;
    rootLines.push(`  --brand-gold: ${hex};`);
    rootLines.push(`  --brand-gold-muted: ${hexToRgba(hex, 0.18)};`);
    rootLines.push(`  --app-gold: ${hex};`);
    rootLines.push(`  --app-gold-text: ${hex};`);
  }

  if (custom.fontFamily) {
    rootLines.push(`  --app-font: ${custom.fontFamily};`);
  }

  if (custom.buttonStyle) {
    const opt = BUTTON_STYLE_OPTIONS.find((o) => o.value === custom.buttonStyle);
    if (opt) rootLines.push(`  --app-radius: ${opt.radius};`);
  }

  if (rootLines.length > 0) {
    lines.push(`:root {`);
    lines.push(...rootLines);
    lines.push(`}`);
  }

  if (custom.fontFamily) {
    // Body font override — uses the variable we just set so customizations
    // stack cleanly (font can change independently of other overrides).
    lines.push(`body { font-family: var(--app-font, "Inter", system-ui, sans-serif); }`);
  }

  if (custom.buttonStyle) {
    // Apply the radius to the most common button-shaped elements. Opt-in
    // via variable so existing explicit `rounded-*` classes still win.
    lines.push(`.btn-gold, button.theme-btn-primary, button.theme-btn-secondary { border-radius: var(--app-radius, 0.5rem) !important; }`);
  }

  return lines.join("\n");
}

