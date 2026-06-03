import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // wired to the next/font variables set in app/layout.tsx
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      fontWeight: {
        // two weights only — do not add more
        normal: "400",
        medium: "500",
      },
      colors: {
        // green — rescued / success / open
        rescued: {
          50: "#EAF3DE",
          100: "#C0DD97",
          200: "#97C459",
          400: "#639922",
          600: "#3B6D11",
          800: "#27500A",
        },
        // amber — claimed / in-flight / urgent
        urgent: {
          50: "#FAEEDA",
          100: "#FAC775",
          200: "#EF9F27",
          400: "#BA7517",
          600: "#854F0B",
          800: "#633806",
        },
        // red — failed / flake / expired
        failed: {
          50: "#FCEBEB",
          100: "#F7C1C1",
          200: "#F09595",
          400: "#E24B4A",
          600: "#A32D2D",
          800: "#501313",
        },
        // blue — in-transit state only
        transit: {
          50: "#E6F1FB",
          100: "#B5D4F4",
          200: "#85B7EB",
          400: "#378ADD",
          600: "#185FA5",
          800: "#0C447C",
        },
        // gray — neutral / metadata / borders
        neutral: {
          50: "#F1EFE8",
          100: "#D3D1C7",
          200: "#B4B2A9",
          400: "#888780",
          600: "#5F5E5A",
          800: "#444441",
          900: "#2C2C2A",
        },
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
