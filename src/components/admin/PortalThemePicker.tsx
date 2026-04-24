"use client";

import { useCallback } from "react";
import {
  PORTAL_THEMES,
  FONT_FAMILY_OPTIONS,
  BUTTON_STYLE_OPTIONS,
  type PortalTheme,
  type ThemeCustomizations,
} from "@/lib/portalThemes";
import { useTheme } from "@/components/layout/ThemeProvider";

/**
 * Admin Settings → Portal Themes card. Renders a thumbnail grid of every
 * registered theme. The "Default" thumbnail is always first and preserves
 * the current portal look exactly — selecting it removes all variable
 * overrides and the baseline globals.css values take over.
 *
 * Preview is live (the whole portal re-paints on selection) so the admin
 * can try a theme before committing via the Save All Settings button. The
 * selection is mirrored in localStorage so a hard reload mid-try doesn't
 * lose the in-progress preview, and the server-authoritative
 * activeThemeId is only written on the regular Save.
 */

export default function PortalThemePicker({
  selectedThemeId,
  onSelect,
  customizations,
  onCustomizationsChange,
}: {
  /** Controlled value — parent holds the draft selection so it can be
   *  bundled into the Save All Settings PUT payload. */
  selectedThemeId: string;
  onSelect: (id: string) => void;
  customizations: ThemeCustomizations;
  onCustomizationsChange: (c: ThemeCustomizations) => void;
}) {
  const { portalThemeId, setPortalThemeId, setThemeCustomizations } = useTheme();

  const pick = useCallback((id: string) => {
    onSelect(id);
    // Live preview — apply immediately so the admin sees the change
    // without having to save first.
    setPortalThemeId(id);
  }, [onSelect, setPortalThemeId]);

  const updateCustom = useCallback((patch: Partial<ThemeCustomizations>) => {
    const next = { ...customizations, ...patch };
    // Strip empty/default values so we don't persist noise.
    if (!next.accentColor) delete next.accentColor;
    if (!next.fontFamily) delete next.fontFamily;
    if (!next.buttonStyle) delete next.buttonStyle;
    onCustomizationsChange(next);
    setThemeCustomizations(next);
  }, [customizations, onCustomizationsChange, setThemeCustomizations]);

  const resetCustom = useCallback(() => {
    onCustomizationsChange({});
    setThemeCustomizations({});
  }, [onCustomizationsChange, setThemeCustomizations]);

  const resetToApplied = useCallback(() => {
    // "Revert preview" — drops any unsaved preview and snaps back to
    // whatever's currently persisted on the server (portalThemeId from
    // the context reflects the DB-authoritative value on mount).
    onSelect(portalThemeId);
    setPortalThemeId(portalThemeId);
  }, [onSelect, portalThemeId, setPortalThemeId]);

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="font-display text-lg font-bold">Portal Theme</div>
          <div className="font-body text-[13px] text-[var(--app-text-muted)] mt-1 max-w-xl leading-relaxed">
            Pick a theme to change the overall color scheme, surface contrast,
            and accent color across the partner + admin portals. Each theme
            adapts to Light and Dark mode. <strong>Default</strong> preserves
            the current portal look exactly — pick it any time to revert.
          </div>
        </div>
        {selectedThemeId !== portalThemeId && (
          <button
            type="button"
            onClick={resetToApplied}
            className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 transition-colors"
          >
            Revert preview
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PORTAL_THEMES.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            selected={selectedThemeId === t.id}
            applied={portalThemeId === t.id}
            onSelect={() => pick(t.id)}
          />
        ))}
      </div>

      <div className="mt-4 font-body text-[11px] text-[var(--app-text-faint)] leading-relaxed">
        Click a theme to preview it live on this page. Your choice only
        becomes permanent when you hit <strong>Save All Settings</strong>.
      </div>

      {/* ─── Customization panel ─────────────────────────────────────── */}
      <div className="mt-6 pt-6 border-t border-[var(--app-border)]">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="font-display text-base font-bold">Customize</div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5 max-w-xl">
              Optional overrides layered on top of the chosen theme. Leave blank to stick with the preset values.
            </div>
          </div>
          {(customizations.accentColor || customizations.fontFamily || customizations.buttonStyle) && (
            <button
              type="button"
              onClick={resetCustom}
              className="font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] border border-[var(--app-border)] rounded-lg px-3 py-1.5 transition-colors"
            >
              Reset overrides
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Accent color */}
          <div>
            <label className="font-body text-[11px] tracking-wider uppercase text-[var(--app-text-muted)] block mb-1.5">
              Primary Accent Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customizations.accentColor || "#c4a050"}
                onChange={(e) => updateCustom({ accentColor: e.target.value })}
                className="w-12 h-10 rounded-lg border border-[var(--app-border)] cursor-pointer bg-transparent"
                aria-label="Accent color"
              />
              <input
                type="text"
                value={customizations.accentColor || ""}
                onChange={(e) => updateCustom({ accentColor: e.target.value.trim() || undefined })}
                placeholder="#c4a050"
                className="flex-1 theme-input rounded-lg px-3 py-2 font-mono text-[12px]"
              />
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">
              Overrides the gold/brand accent portal-wide.
            </div>
          </div>

          {/* Font family */}
          <div>
            <label className="font-body text-[11px] tracking-wider uppercase text-[var(--app-text-muted)] block mb-1.5">
              Font Family
            </label>
            <select
              value={customizations.fontFamily || ""}
              onChange={(e) => updateCustom({ fontFamily: e.target.value || undefined })}
              className="w-full theme-input rounded-lg px-3 py-2 text-[13px]"
            >
              <option value="">Use theme default (Inter)</option>
              {FONT_FAMILY_OPTIONS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>
            <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">
              Swaps the body font on every page.
            </div>
          </div>

          {/* Button style */}
          <div>
            <label className="font-body text-[11px] tracking-wider uppercase text-[var(--app-text-muted)] block mb-1.5">
              Button + Input Shape
            </label>
            <div className="inline-flex rounded-lg border border-[var(--app-border)] overflow-hidden w-full">
              {BUTTON_STYLE_OPTIONS.map((o, i) => {
                const active = (customizations.buttonStyle || "rounded") === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => updateCustom({ buttonStyle: o.value === "rounded" ? undefined : o.value })}
                    className={`flex-1 font-body text-[12px] px-3 py-2 transition-colors ${i > 0 ? "border-l border-[var(--app-border)]" : ""} ${
                      active
                        ? "bg-brand-gold/15 text-brand-gold"
                        : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                    }`}
                  >
                    <span
                      className="inline-block w-8 h-4 border-2 align-middle mr-1.5"
                      style={{ borderColor: "currentColor", borderRadius: o.radius === "0" ? "0" : o.radius === "999px" ? "999px" : "0.25rem" }}
                    />
                    {o.label.replace(" (default)", "")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  theme,
  selected,
  applied,
  onSelect,
}: {
  theme: PortalTheme;
  selected: boolean;
  applied: boolean;
  onSelect: () => void;
}) {
  const p = theme.preview;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group text-left rounded-xl overflow-hidden transition-all border-2 ${
        selected
          ? "border-brand-gold shadow-lg shadow-brand-gold/20"
          : "border-[var(--app-border)] hover:border-brand-gold/40"
      }`}
    >
      {/* Mini-portal preview — a miniaturized layout using the theme's
          actual preview colors as inline styles. Scoped to the card so
          it never affects the surrounding admin UI. */}
      <div
        className="relative"
        style={{
          background: p.bg,
          height: 148,
        }}
      >
        {/* Sidebar strip */}
        <div
          className="absolute inset-y-0 left-0 w-[28%] flex flex-col items-center py-2 gap-1.5"
          style={{ background: p.sidebar, borderRight: `1px solid ${p.border}` }}
        >
          <div className="w-5 h-5 rounded" style={{ background: p.accent, opacity: 0.85 }} />
          <div className="w-[80%] h-1.5 rounded" style={{ background: p.textMuted, opacity: 0.45 }} />
          <div className="w-[80%] h-1.5 rounded" style={{ background: p.textMuted, opacity: 0.3 }} />
          <div className="w-[80%] h-1.5 rounded" style={{ background: p.textMuted, opacity: 0.3 }} />
          <div className="w-[80%] h-1.5 rounded" style={{ background: p.accent, opacity: 0.8 }} />
          <div className="w-[80%] h-1.5 rounded" style={{ background: p.textMuted, opacity: 0.3 }} />
        </div>

        {/* Main content */}
        <div className="absolute inset-y-0 right-0 w-[72%] p-3 flex flex-col gap-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="h-2 w-10 rounded" style={{ background: p.text, opacity: 0.85 }} />
            <div className="h-3 w-8 rounded" style={{ background: p.accent }} />
          </div>

          {/* Card */}
          <div
            className="flex-1 rounded-md p-2 flex flex-col gap-1.5"
            style={{ background: p.card, border: `1px solid ${p.border}` }}
          >
            <div className="h-1.5 w-[60%] rounded" style={{ background: p.text, opacity: 0.85 }} />
            <div className="h-1.5 w-[90%] rounded" style={{ background: p.textMuted, opacity: 0.55 }} />
            <div className="h-1.5 w-[80%] rounded" style={{ background: p.textMuted, opacity: 0.45 }} />
            <div className="flex gap-1 mt-auto">
              <div className="h-2 w-6 rounded" style={{ background: p.accent }} />
              <div className="h-2 w-6 rounded" style={{ background: p.border }} />
            </div>
          </div>
        </div>

        {/* Selected / applied badges */}
        {selected && (
          <div
            className="absolute top-2 right-2 font-body text-[9px] font-bold tracking-wider uppercase rounded-full px-2 py-0.5"
            style={{ background: p.accent, color: p.bg }}
          >
            Selected
          </div>
        )}
        {applied && !selected && (
          <div
            className="absolute top-2 right-2 font-body text-[9px] font-bold tracking-wider uppercase rounded-full px-2 py-0.5 border"
            style={{ background: "transparent", color: p.accent, borderColor: p.accent }}
          >
            Applied
          </div>
        )}
      </div>

      <div className="p-3 theme-card border-t border-[var(--app-border)]">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="font-body text-sm font-semibold text-[var(--app-text)]">
            {theme.name}
          </div>
          {theme.id === "default" && (
            <span className="font-body text-[9px] tracking-wider uppercase text-[var(--app-text-faint)] border border-[var(--app-border)] rounded px-1 py-0.5">
              Original
            </span>
          )}
        </div>
        <div className="font-body text-[11px] text-[var(--app-text-muted)] leading-snug">
          {theme.vibe}
        </div>
      </div>
    </button>
  );
}
