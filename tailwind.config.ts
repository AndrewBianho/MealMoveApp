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
      // All color tokens resolve to CSS variables (RGB channels) defined in
      // globals.css (:root = the "Arctic Blue" light theme). The channel form
      // keeps `/opacity` utilities working.
      colors: {
        rescued: {
          50: "rgb(var(--rescued-50) / <alpha-value>)",
          100: "rgb(var(--rescued-100) / <alpha-value>)",
          200: "rgb(var(--rescued-200) / <alpha-value>)",
          400: "rgb(var(--rescued-400) / <alpha-value>)",
          600: "rgb(var(--rescued-600) / <alpha-value>)",
          800: "rgb(var(--rescued-800) / <alpha-value>)",
        },
        urgent: {
          50: "rgb(var(--urgent-50) / <alpha-value>)",
          100: "rgb(var(--urgent-100) / <alpha-value>)",
          200: "rgb(var(--urgent-200) / <alpha-value>)",
          400: "rgb(var(--urgent-400) / <alpha-value>)",
          600: "rgb(var(--urgent-600) / <alpha-value>)",
          800: "rgb(var(--urgent-800) / <alpha-value>)",
        },
        failed: {
          50: "rgb(var(--failed-50) / <alpha-value>)",
          100: "rgb(var(--failed-100) / <alpha-value>)",
          200: "rgb(var(--failed-200) / <alpha-value>)",
          400: "rgb(var(--failed-400) / <alpha-value>)",
          600: "rgb(var(--failed-600) / <alpha-value>)",
          800: "rgb(var(--failed-800) / <alpha-value>)",
        },
        transit: {
          50: "rgb(var(--transit-50) / <alpha-value>)",
          100: "rgb(var(--transit-100) / <alpha-value>)",
          200: "rgb(var(--transit-200) / <alpha-value>)",
          400: "rgb(var(--transit-400) / <alpha-value>)",
          600: "rgb(var(--transit-600) / <alpha-value>)",
          800: "rgb(var(--transit-800) / <alpha-value>)",
        },
        // Surfaces / text / borders: 50 is the app background, 900 the primary
        // text (ink).
        neutral: {
          50: "rgb(var(--n-50) / <alpha-value>)",
          100: "rgb(var(--n-100) / <alpha-value>)",
          200: "rgb(var(--n-200) / <alpha-value>)",
          300: "rgb(var(--n-300) / <alpha-value>)",
          400: "rgb(var(--n-400) / <alpha-value>)",
          500: "rgb(var(--n-500) / <alpha-value>)",
          600: "rgb(var(--n-600) / <alpha-value>)",
          700: "rgb(var(--n-700) / <alpha-value>)",
          800: "rgb(var(--n-800) / <alpha-value>)",
          900: "rgb(var(--n-900) / <alpha-value>)",
        },
        clay: {
          50: "rgb(var(--clay-50) / <alpha-value>)",
          100: "rgb(var(--clay-100) / <alpha-value>)",
          200: "rgb(var(--clay-200) / <alpha-value>)",
          400: "rgb(var(--clay-400) / <alpha-value>)",
          600: "rgb(var(--clay-600) / <alpha-value>)",
          800: "rgb(var(--clay-800) / <alpha-value>)",
        },
        // Wayfinding only — the active map route (maps blue) and its muted
        // alternatives. Not a status color; used solely by RescueMap's route
        // lines and the route-picker panel. Raw-DOM hex lives in rampColors.
        route: {
          DEFAULT: "rgb(var(--route) / <alpha-value>)",
          alt: "rgb(var(--route-alt) / <alpha-value>)",
        },
        // Raised card surface — white in light, lifted charcoal in dark.
        card: "rgb(var(--card) / <alpha-value>)",
      },
      borderRadius: {
        md: "14px",
        lg: "18px",
        xl: "22px",
        "2xl": "28px",
        "3xl": "34px",
      },
      boxShadow: {
        // Layered, warm-neutral elevation: a tight contact shadow + a soft
        // diffuse one for a premium, tactile depth on the themed surfaces. The
        // shadow ink is a warm brown-black, matching the surface it falls on —
        // a cool navy shadow on warm paper reads grey and slightly dirty.
        card: "0 1px 2px -1px rgba(44,34,24,0.12), 0 16px 36px -22px rgba(44,34,24,0.32)",
        lift: "0 2px 6px -2px rgba(44,34,24,0.16), 0 26px 52px -22px rgba(44,34,24,0.42)",
        glow: "0 10px 24px -12px rgba(95,126,80,0.85)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Toast keeps the -50% horizontal centering throughout so it doesn't
        // jump when the animation's transform takes over from the utility class.
        "toast-in": {
          from: { opacity: "0", transform: "translate(-50%, 10px)" },
          to: { opacity: "1", transform: "translate(-50%, 0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Directional carousel transitions for the welcome intro: content
        // enters from the side it advances toward. Reduced motion falls back to
        // a plain fade (see usage), so these are decorative entrances only.
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // Bottom sheet rising into place (the time-picker wheel sheet).
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        // The claim confirmation's check drawing itself in a single stroke
        // (ClaimHoldPanel). Counts down from the path's ~20-unit dasharray;
        // `both` leaves it drawn, so reduced motion simply shows a finished
        // check instead of animating one.
        "draw-check": {
          from: { strokeDashoffset: "20" },
          to: { strokeDashoffset: "0" },
        },
        // Celebration leaves: drift down with a gentle sway and fade out.
        // Decorative only (RescueCelebration), gated behind motion-safe.
        "leaf-fall": {
          "0%": { opacity: "0", transform: "translate(0, -10vh) rotate(0deg)" },
          "8%": { opacity: "1" },
          "50%": { transform: "translate(2.5rem, 45vh) rotate(150deg)" },
          "85%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translate(-1rem, 105vh) rotate(300deg)" },
        },
      },
      animation: {
        // ease-out-quint / ease-out for confident, calm deceleration.
        "fade-up": "fade-up 0.55s cubic-bezier(0.2,0.8,0.2,1) both",
        "toast-in": "toast-in 0.22s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.18s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.18s ease-out both",
        "slide-down": "slide-down 0.2s cubic-bezier(0.22,1,0.36,1) both",
        "slide-in-right": "slide-in-right 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "slide-in-left": "slide-in-left 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "sheet-up": "sheet-up 0.28s cubic-bezier(0.22,1,0.36,1) both",
        "draw-check": "draw-check 0.45s cubic-bezier(0.22,1,0.36,1) 0.12s both",
        "leaf-fall": "leaf-fall 6s ease-in both",
      },
      // Semantic layering scale — sticky header < dropdown/menu < modal overlay
      // < toast (toasts must surface above an open modal).
      zIndex: {
        sticky: "10",
        dropdown: "20",
        modal: "50",
        toast: "60",
      },
    },
  },
  plugins: [],
};

export default config;
