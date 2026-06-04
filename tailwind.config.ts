import type { Config } from "tailwindcss";

// "Harvest Press" — warm editorial food-rescue aesthetic.
// Semantic ramp names are kept (rescued/urgent/failed/transit/neutral) so
// components re-skin from these tokens; the values are a warm, appetizing set.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"], // Fraunces
        sans: ["var(--font-sans)", "system-ui", "sans-serif"], // Hanken Grotesk
        mono: ["var(--font-mono)", "monospace"], // JetBrains Mono
      },
      colors: {
        // leaf green — rescued / success / open
        rescued: {
          50: "#EAF2E6",
          100: "#C6E0BC",
          200: "#97C78A",
          400: "#4F9E54",
          600: "#2C7A43",
          800: "#173E27",
        },
        // honey amber — claimed / in-flight / urgent
        urgent: {
          50: "#FBF0DB",
          100: "#F6D79B",
          200: "#EDB85C",
          400: "#D2901F",
          600: "#9A6411",
          800: "#5E3D0A",
        },
        // tomato — failed / flake / expired
        failed: {
          50: "#FBE7E0",
          100: "#F4BCA9",
          200: "#EC8E72",
          400: "#E0532B",
          600: "#AE3417",
          800: "#641E0F",
        },
        // plum — in-transit
        transit: {
          50: "#F0E6F1",
          100: "#D6BBDA",
          200: "#B488BB",
          400: "#894F95",
          600: "#62306E",
          800: "#391844",
        },
        // warm paper & ink — neutral / surfaces / text
        neutral: {
          50: "#FBF6EC",
          100: "#EFE6D4",
          200: "#DCCFB4",
          400: "#A89A7E",
          600: "#6E6453",
          800: "#3A352C",
          900: "#211C15",
        },
      },
      borderRadius: {
        md: "10px",
        lg: "16px",
        xl: "20px",
        "2xl": "28px",
      },
      boxShadow: {
        // warm, layered editorial elevation (ink-tinted, not gray)
        card: "0 1px 0 0 rgba(33,28,21,0.04), 0 14px 28px -18px rgba(33,28,21,0.28)",
        lift: "0 2px 0 0 rgba(33,28,21,0.05), 0 22px 40px -20px rgba(33,28,21,0.38)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.2,0.8,0.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
