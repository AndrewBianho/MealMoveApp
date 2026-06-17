// The two base-map modes offered on every map. "Satellite" is real aerial
// imagery with roads/labels overlaid (legible for navigation); "Map" is the
// colored vector street style. Shared so ListingsMap and RescueMap stay in sync.
export const MAP_STYLES = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/standard",
} as const;

export type MapMode = keyof typeof MAP_STYLES;

// Remember the chosen base-map mode across visits (shared by both maps). Read in
// a mount effect — never a useState initializer — to avoid SSR/hydration drift.
const MODE_KEY = "mm.mapMode";
export function readMapMode(): MapMode | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === "streets" || v === "satellite" ? v : null;
  } catch {
    return null;
  }
}
export function writeMapMode(mode: MapMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

// A single-button Mapbox IControl: a home glyph that re-frames the map to its
// default fitted view. Styled as a `.mapboxgl-ctrl-group` so it matches the
// frosted chrome and the compass it sits beside.
const ICON_HOME =
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M3 10.5 12 3l9 7.5"/>` +
  `<path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>`;

export function createHomeControl(opts: { onClick: () => void }) {
  let container: HTMLDivElement;
  return {
    onAdd() {
      container = document.createElement("div");
      container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mm-home-btn";
      btn.setAttribute("aria-label", "Reset map view");
      btn.title = "Reset view";
      btn.innerHTML = ICON_HOME;
      btn.addEventListener("click", () => opts.onClick());
      container.appendChild(btn);
      return container;
    },
    onRemove() {
      container.remove();
    },
  };
}

const LABELS: Record<MapMode, string> = {
  streets: "Map",
  satellite: "Satellite",
};

// Glyphs for the segmented toggle: a folded map for the vector style, a globe
// for satellite. stroke="currentColor" so the active (ink-filled) segment flips
// the icon to cream.
const ICONS: Record<MapMode, string> = {
  streets:
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3Z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>`,
  satellite:
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>` +
    `<path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18Z"/></svg>`,
};

// Display order in the segmented toggle — "Map" before "Satellite" by convention.
const ORDER: MapMode[] = ["streets", "satellite"];

// A framework-agnostic Mapbox IControl: a small segmented Map / Satellite
// toggle. It styles itself as a `.mapboxgl-ctrl-group` so it picks up the same
// frosted-cream chrome as the zoom controls and stacks neatly beside them.
export function createModeToggle(opts: {
  initial: MapMode;
  onChange: (mode: MapMode) => void;
}) {
  let container: HTMLDivElement;
  let current = opts.initial;
  const buttons = new Map<MapMode, HTMLButtonElement>();

  const sync = () => {
    buttons.forEach((btn, mode) => {
      btn.setAttribute("aria-pressed", String(mode === current));
    });
  };

  return {
    onAdd() {
      container = document.createElement("div");
      container.className = "mapboxgl-ctrl mapboxgl-ctrl-group mm-mode-toggle";
      ORDER.forEach((mode) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = ICONS[mode];
        btn.title = LABELS[mode];
        btn.setAttribute("aria-label", `Show ${LABELS[mode].toLowerCase()} view`);
        btn.addEventListener("click", () => {
          if (current === mode) return;
          current = mode;
          sync();
          opts.onChange(mode);
        });
        buttons.set(mode, btn);
        container.appendChild(btn);
      });
      sync();
      return container;
    },
    onRemove() {
      container.remove();
      buttons.clear();
    },
    // Keep the control in sync when the mode changes outside a button click.
    setMode(mode: MapMode) {
      current = mode;
      sync();
    },
  };
}
