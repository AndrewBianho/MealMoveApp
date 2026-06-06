// Client-side forward geocoding for the rescue map's address inputs ("your
// location" / "final destination"). Runs in the browser with the public Mapbox
// token, biased toward Malvern Prep. Separate from the server-only lib/geocode.ts
// (which can't be imported into client code). Never throws — a null result means
// "couldn't find that address".

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MALVERN = { lat: 40.02724, lng: -75.51239 };

export interface GeocodeHit {
  center: [number, number]; // [lng, lat]
  name: string;
}

export async function geocodeClient(query: string): Promise<GeocodeHit | null> {
  const q = query?.trim();
  if (!q || !TOKEN) return null;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?limit=1&country=us&proximity=${MALVERN.lng},${MALVERN.lat}&access_token=${TOKEN}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: { center?: [number, number]; place_name?: string }[];
    };
    const f = data.features?.[0];
    if (!f?.center || f.center.length !== 2) return null;
    return { center: f.center, name: f.place_name ?? q };
  } catch {
    return null;
  }
}
