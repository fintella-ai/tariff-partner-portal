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
          dark: "#060a14",
          "dark-lighter": "#0c1220",
        },
        accent: {
          blue: "#4f6ef7",
          "blue-light": "#6b8aff",
          purple: "#8b5cf6",
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", '"Times New Roman"', "serif"],
        body: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ['"DM Serif Display"', "Georgia", "serif"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        "glass": "0 8px 32px rgba(0, 0, 0, 0.12)",
        "glass-dark": "0 8px 32px rgba(0, 0, 0, 0.4)",
        "gold-glow": "0 6px 24px rgba(196, 160, 80, 0.30)",
        "blue-glow": "0 6px 24px rgba(79, 110, 247, 0.20)",
      },
      backdropBlur: {
        "glass": "12px",
      },
    },
  },
  plugins: [],
};
export default config;
