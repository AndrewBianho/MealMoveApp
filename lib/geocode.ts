import "server-only";

// Forward-geocode a street address to coordinates via the Mapbox Geocoding API.
// Used at restaurant sign-up so a real address lands a real pin on the rescue
// map (rather than the 0,0 "null island"). Server-only: prefers an unrestricted
// MAPBOX_TOKEN, falling back to the public token. Never throws — callers treat a
// null result as "couldn't locate" and fall back to campus center.

// Campus center — biases results and is the registration fallback.
const CAMPUS = { lat: 40.04, lng: -75.34 };

const TOKEN = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export interface GeoPoint {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const query = address?.trim();
  if (!query || !TOKEN) return null;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?limit=1&country=us&proximity=${CAMPUS.lng},${CAMPUS.lat}&access_token=${TOKEN}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { center?: [number, number] }[];
    };
    const center = data.features?.[0]?.center;
    if (!center || center.length !== 2) return null;
    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
