import type { Config } from "tailwindcss";

// "Soft Harvest" — warm, organic, friendly food-rescue aesthetic.
// Semantic ramp names are kept (rescued/urgent/failed/transit/neutral) so
// components re-skin from these tokens; the values are an earthy, soft set
// (sage / honey / tomato / plum on a cream paper surface).
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"], // Fraunces
        sans: ["var(--font-sans)", "system-ui", "sans-serif"], // Nunito Sans
        mono: ["var(--font-mono)", "monospace"], // JetBrains Mono
      },
      colors: {
        // sage green — rescued / success / open
        rescued: {
          50: "#EEF3E9",
          100: "#D5E2C8",
          200: "#B3C9A0",
          400: "#7F9C6F",
          600: "#5F7E50",
          800: "#34452A",
        },
        // honey amber — claimed / in-flight / urgent
        urgent: {
          50: "#FBF1DC",
          100: "#F6DFA9",
          200: "#EFC877",
          400: "#E7B454",
          600: "#B5862C",
          800: "#6E4F12",
        },
        // tomato — failed / flake / expired
        failed: {
          50: "#FBE8E2",
          100: "#F3C3B6",
          200: "#E89C89",
          400: "#D4654F",
          600: "#A8412E",
          800: "#642318",
        },
        // plum — in-transit
        transit: {
          50: "#F2ECF5",
          100: "#DCCBE6",
          200: "#C0A6D0",
          400: "#9A7FB0",
          600: "#6E5684",
          800: "#3E2B4E",
        },
        // warm cream paper & soft ink — neutral / surfaces / text
        neutral: {
          50: "#F7F3EA",
          100: "#EFE8DA",
          200: "#DED4C0",
          400: "#A89E8B",
          600: "#6F6F62",
          800: "#44423A",
          900: "#33342C",
        },
        // clay — a warm secondary accent (links, route arrows)
        clay: {
          50: "#FAEDE3",
          100: "#F0CDB3",
          200: "#E3A87F",
          400: "#D98A5F",
          600: "#C06D40",
          800: "#7A3F20",
        },
      },
      borderRadius: {
        md: "14px",
        lg: "18px",
        xl: "22px",
        "2xl": "28px",
        "3xl": "34px",
      },
      boxShadow: {
        // soft, warm, diffuse elevation — gentle on the cream surface
        card: "0 14px 34px -20px rgba(80,70,40,0.45)",
        lift: "0 22px 48px -22px rgba(80,70,40,0.55)",
        glow: "0 10px 22px -12px rgba(95,126,80,0.9)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.2,0.8,0.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
