"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  buildThemeCSS,
  buildCustomizationCSS,
  PORTAL_THEME_STYLE_ID,
  PORTAL_CUSTOM_STYLE_ID,
  type ThemeCustomizations,
} from "@/lib/portalThemes";

type ThemeValue = "light" | "dark";

interface ThemeContextType {
  theme: ThemeValue;
  systemTheme: ThemeValue;
  setTheme: (t: ThemeValue) => void;
  toggleTheme: () => void;
  /** Currently applied portal theme id (e.g. "default", "emerald-finance"). */
  portalThemeId: string;
  /** Swap the active portal theme. Persists to localStorage so the
   *  anti-flash script picks it up on the next page load. Does NOT hit
   *  the API — the settings page is responsible for persisting to
   *  PortalSettings. */
  setPortalThemeId: (id: string) => void;
  /** Per-admin theme customizations layered on top of the base preset. */
  themeCustomizations: ThemeCustomizations;
  setThemeCustomizations: (c: ThemeCustomizations) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  systemTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  portalThemeId: "default",
  setPortalThemeId: () => {},
  themeCustomizations: {},
  setThemeCustomizations: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ThemeValue {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(t: ThemeValue) {
  document.documentElement.setAttribute("data-theme", t);
}

function applyPortalTheme(themeId: string) {
  if (typeof document === "undefined") return;
  const css = buildThemeCSS(themeId);
  let tag = document.getElementById(PORTAL_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    // Default theme: remove the override tag so globals.css rules unaltered.
    if (tag) tag.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("style");
    tag.id = PORTAL_THEME_STYLE_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

function applyCustomizations(c: ThemeCustomizations | null | undefined) {
  if (typeof document === "undefined") return;
  const css = buildCustomizationCSS(c);
  let tag = document.getElementById(PORTAL_CUSTOM_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    if (tag) tag.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("style");
    tag.id = PORTAL_CUSTOM_STYLE_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [systemTheme, setSystemTheme] = useState<ThemeValue>("dark");
  const [theme, setThemeState] = useState<ThemeValue>("dark");
  const [portalThemeId, setPortalThemeIdState] = useState<string>("default");
  const [themeCustomizations, setThemeCustomizationsState] = useState<ThemeCustomizations>({});

  // On mount: read localStorage, fall back to system
  useEffect(() => {
    const sys = getSystemTheme();
    setSystemTheme(sys);

    let stored: ThemeValue | null = null;
    try {
      const raw = localStorage.getItem("theme");
      if (raw === "light" || raw === "dark") stored = raw;
    } catch {}

    const resolved = stored ?? sys;
    setThemeState(resolved);
    applyTheme(resolved);

    // Read cached portal theme + customizations synchronously to minimize
    // flash, then reconcile against the server-authoritative values from
    // PortalSettings. Cached values live in localStorage keys "portalTheme"
    // and "portalThemeCustom", written by the settings page after save
    // and here on first fetch.
    try {
      const cachedTheme = localStorage.getItem("portalTheme");
      if (cachedTheme) {
        setPortalThemeIdState(cachedTheme);
        applyPortalTheme(cachedTheme);
      }
      const cachedCustom = localStorage.getItem("portalThemeCustom");
      if (cachedCustom) {
        try {
          const parsed = JSON.parse(cachedCustom) as ThemeCustomizations;
          setThemeCustomizationsState(parsed);
          applyCustomizations(parsed);
        } catch {}
      }
    } catch {}
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const serverId = d?.settings?.activeThemeId;
        if (typeof serverId === "string" && serverId.length > 0) {
          try { localStorage.setItem("portalTheme", serverId); } catch {}
          setPortalThemeIdState(serverId);
          applyPortalTheme(serverId);
        }
        const rawCustom = d?.settings?.themeCustomizations;
        if (typeof rawCustom === "string") {
          try {
            const parsed = JSON.parse(rawCustom) as ThemeCustomizations;
            try { localStorage.setItem("portalThemeCustom", rawCustom); } catch {}
            setThemeCustomizationsState(parsed);
            applyCustomizations(parsed);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Listen for OS preference changes (only effective when no localStorage override)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const sys: ThemeValue = e.matches ? "dark" : "light";
      setSystemTheme(sys);
      // Only follow system if user hasn't set a manual override
      try {
        if (!localStorage.getItem("theme")) {
          setThemeState(sys);
          applyTheme(sys);
        }
      } catch {
        setThemeState(sys);
        applyTheme(sys);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback((t: ThemeValue) => {
    try { localStorage.setItem("theme", t); } catch {}
    setThemeState(t);
    applyTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const setPortalThemeId = useCallback((id: string) => {
    try { localStorage.setItem("portalTheme", id); } catch {}
    setPortalThemeIdState(id);
    applyPortalTheme(id);
  }, []);

  const setThemeCustomizations = useCallback((c: ThemeCustomizations) => {
    try { localStorage.setItem("portalThemeCustom", JSON.stringify(c)); } catch {}
    setThemeCustomizationsState(c);
    applyCustomizations(c);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, systemTheme, setTheme, toggleTheme, portalThemeId, setPortalThemeId, themeCustomizations, setThemeCustomizations }}>
      {children}
    </ThemeContext.Provider>
  );
}
