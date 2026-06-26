// Shared class recipes for the auth surface (sign in · forgot · sign up).
// One source of truth so every field, label and error banner across the three
// screens shares the exact same form-control vocabulary. Tokens only — ACCENT
// maps to `rescued` (sage), the system's primary/success/focus hue.

// Text input: white on the white card, defined by a calm border that warms to
// sage on focus (matching Button's rescued focus ring). 14px radius (token md).
export const inputCls =
  "w-full rounded-md border border-neutral-200 bg-card px-3.5 py-3 text-[15px] " +
  "text-neutral-900 placeholder:text-neutral-500 transition-colors " +
  "focus-visible:outline-none focus-visible:border-rescued-400 " +
  "focus-visible:ring-2 focus-visible:ring-rescued-400/40";

// Field label: mono metadata, the app-wide convention for form labels.
export const labelCls =
  "mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-neutral-700";

// Validation banner: tomato on a soft tomato wash, paired with text (never hue
// alone). Status code keeps it legible without color perception.
export const errorBannerCls =
  "rounded-lg border border-failed-200 bg-failed-50 px-3.5 py-2.5 text-sm text-failed-800";
