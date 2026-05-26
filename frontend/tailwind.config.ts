import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-secondary": "rgb(var(--accent-secondary) / <alpha-value>)",
        "accent-foreground": "rgb(var(--accent-foreground) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
      },
      fontFamily: {
        display: "var(--font-display)",
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        "xs": "0.75rem",
        "sm": "0.875rem",
        "base": "1rem",
        "lg": "1.125rem",
        "xl": "1.25rem",
        "2xl": "1.5rem",
        "3xl": ["3.25rem", { lineHeight: "1.15" }],
        "5xl": ["5.25rem", { lineHeight: "1.05" }],
      },
      spacing: {
        "28": "7rem",
        "44": "11rem",
      },
      borderRadius: {
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        "sm": "0 1px 3px rgba(0,0,0,0.06)",
        "md": "0 4px 6px rgba(0,0,0,0.07)",
        "lg": "0 10px 15px rgba(0,0,0,0.08)",
        "xl": "0 20px 25px rgba(0,0,0,0.1)",
        "accent": "0 4px 14px rgba(0,82,255,0.25)",
        "accent-lg": "0 8px 24px rgba(0,82,255,0.35)",
      },
      animation: {
        "spin-slow": "spin 60s linear infinite",
        "float": "float 4s ease-in-out infinite",
        "float-delayed": "float 5s ease-in-out infinite 0.5s",
        "pulse-soft": "pulse-soft 2s infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.7", transform: "scale(1.3)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
