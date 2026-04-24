import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "#c4a050",
          "gold-light": "#f0d070",
          purple: "#a78bfa",
          dark: "#080d1c",
          "dark-lighter": "#0d1a3a",
        },
      },
      fontFamily: {
        // Portal-wide type is Inter. Both `font-display` and `font-body`
        // map to the same family — the visual distinction is driven by
        // weight, not a separate font. Kept both tokens so existing
        // `font-display` / `font-body` markup continues to compile
        // without a codebase-wide find-replace.
        display: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        body: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
