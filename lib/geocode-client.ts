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

/**
 * Autocomplete variant of geocodeClient: several results instead of one, and
 * cancellable so a slow response can't overwrite a newer query. Shares the
 * proximity bias and country filter with the single-result path above.
 *
 * Never throws — an empty array means "no addresses", which lets the caller
 * still show recent and on-map suggestions when the network is unavailable.
 */
export async function geocodeSuggest(
  query: string,
  signal?: AbortSignal
): Promise<import("./mapSuggestions").Suggestion[]> {
  const q = query?.trim();
  if (!q || !TOKEN) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?limit=5&autocomplete=true&country=us` +
    `&proximity=${MALVERN.lng},${MALVERN.lat}&access_token=${TOKEN}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: { id?: string; center?: [number, number]; text?: string; place_name?: string }[];
    };
    return (data.features ?? [])
      .filter((f) => Array.isArray(f.center) && f.center.length === 2)
      .map((f, i) => {
        const center = f.center as [number, number];
        const full = f.place_name ?? f.text ?? q;
        return {
          id: `addr-${f.id ?? i}`,
          group: "address" as const,
          label: f.text ?? full,
          sublabel: full,
          stop: { kind: "place" as const, center, label: full },
        };
      });
  } catch {
    // Includes AbortError when a newer keystroke supersedes this request.
    return [];
  }
}
