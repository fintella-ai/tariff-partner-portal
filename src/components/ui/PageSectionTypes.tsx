"use client";

/**
 * Level 3 Edit Layout — Phase D section-type registry.
 *
 * Each type declares:
 *   - `label`       — human-readable type name shown in the Add picker.
 *   - `defaultData` — the payload freshly-added sections start with.
 *   - `render`      — pure display of a saved section.
 *   - `fields`      — ordered list of editor fields (string | textarea |
 *                     url | color). The modal renders them verbatim and
 *                     writes back into `data`.
 *
 * Keep each type self-contained so the registry is the only file to
 * touch when adding a new type (e.g. "Stat Row", "YouTube Embed").
 */
import type { ReactNode } from "react";

export type SectionFieldKind = "text" | "textarea" | "url" | "color";
export type SectionField = {
  key: string;
  label: string;
  kind: SectionFieldKind;
  placeholder?: string;
};

export type SectionTypeDef = {
  label: string;
  description: string;
  defaultData: Record<string, unknown>;
  render: (data: Record<string, unknown>) => ReactNode;
  fields: SectionField[];
};

function str(data: Record<string, unknown>, key: string, fallback = ""): string {
  const v = data[key];
  return typeof v === "string" ? v : fallback;
}

export const SECTION_TYPES: Record<string, SectionTypeDef> = {
  promo_banner: {
    label: "Promo Banner",
    description: "A call-to-action strip with a title, body, and optional button.",
    defaultData: {
      title: "New: 25% Partner Bonus",
      body: "Close one more deal this month to unlock the bonus.",
      ctaLabel: "Learn more",
      ctaUrl: "/dashboard/reporting",
      accent: "#c4a050",
    },
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "body", label: "Body", kind: "textarea" },
      { key: "ctaLabel", label: "Button label", kind: "text" },
      { key: "ctaUrl", label: "Button URL", kind: "url" },
      { key: "accent", label: "Accent color", kind: "color" },
    ],
    render: (data) => {
      const title = str(data, "title");
      const body = str(data, "body");
      const ctaLabel = str(data, "ctaLabel");
      const ctaUrl = str(data, "ctaUrl");
      const accent = str(data, "accent") || "#c4a050";
      return (
        <div
          className="rounded-xl border p-5 sm:p-6 flex flex-col items-center text-center gap-3"
          style={{
            borderColor: `${accent}55`,
            background: `linear-gradient(135deg, ${accent}14, transparent)`,
          }}
        >
          {title ? (
            <div className="font-display text-[18px] font-bold" style={{ color: accent }}>
              {title}
            </div>
          ) : null}
          {body ? (
            <p className="font-body text-[13px] text-[var(--app-text)] max-w-prose whitespace-pre-wrap">
              {body}
            </p>
          ) : null}
          {ctaLabel && ctaUrl ? (
            <a
              href={ctaUrl}
              className="font-body text-[12px] font-semibold border rounded-full px-4 py-1.5 transition-colors"
              style={{ borderColor: `${accent}66`, color: accent }}
            >
              {ctaLabel}
            </a>
          ) : null}
        </div>
      );
    },
  },
  divider: {
    label: "Divider",
    description: "A thin horizontal rule used to separate sections.",
    defaultData: {},
    fields: [],
    render: () => (
      <hr className="my-6 sm:my-8 border-0 border-t border-[var(--app-border)]" />
    ),
  },
  markdown: {
    label: "Markdown Block",
    description: "A freeform text block. Supports basic paragraphs; no HTML.",
    defaultData: {
      body: "Write your content here. Each blank line starts a new paragraph.",
    },
    fields: [{ key: "body", label: "Content", kind: "textarea" }],
    render: (data) => {
      const body = str(data, "body");
      if (!body) return null;
      const paragraphs = body.split(/\n{2,}/);
      return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-5 sm:p-6 flex flex-col gap-3">
          {paragraphs.map((p, i) => (
            <p key={i} className="font-body text-[13px] text-[var(--app-text)] whitespace-pre-wrap">
              {p}
            </p>
          ))}
        </div>
      );
    },
  },
};

export const SECTION_TYPE_IDS = Object.keys(SECTION_TYPES);
