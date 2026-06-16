// Straight-line ("as the crow flies") distance helpers. Pure math via the
// haversine formula — no geocoding or routing API, so it adds zero fees. The
// label is honest about being a rough "how far", not a driving route length.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MI = 3958.8;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

// Compact, mono-friendly miles label. Very close reads as "<0.1 mi"; otherwise
// one decimal up to 10 miles, then whole miles. Returns the em-dash placeholder
// for non-finite input so callers can hand it straight to the card.
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles)) return "—";
  if (miles < 0.1) return "<0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}
