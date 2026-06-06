// Shared Tailwind class recipes — one source of truth for lockups repeated
// across components. Compose with cn() and add per-use sizing/shape.

// Primary action fill: the sage gradient + warm glow (DESIGN.md primary button).
// Used by Button's primary variant and the bespoke action buttons that need a
// different shape/size than Button (camera capture, chat send).
export const primaryFill =
  "bg-gradient-to-b from-rescued-400 to-rescued-600 text-white shadow-glow";
