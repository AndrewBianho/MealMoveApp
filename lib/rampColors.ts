// Single source of truth for the ramp hex used by raw-DOM Mapbox markers, lines
// and popups (ListingsMap / RescueMap). Those draw outside React/Tailwind, so
// they can't read the tokens — these values MUST mirror tailwind.config.ts
// (DESIGN.md). Keep them in sync if the palette changes. Stops are 600 unless
// the name says otherwise.
export const RAMP = {
  rescued600: "#5F7E50", // sage — open / plenty of time
  urgent600: "#B5862C", // honey — getting urgent
  failed400: "#D4654F", // tomato (light) — very soon
  failed600: "#A8412E", // tomato — very soon (stronger)
  transit600: "#6E5684", // plum — drop-offs / in transit
  clay600: "#C06D40", // clay — routes + recommended accent
  clay800: "#7A3F20", // clay (deep) — final destination
  neutral400: "#A89E8B", // warm grey — spent / all claimed
  ink: "#33342C", // soft ink — "my location"
} as const;
