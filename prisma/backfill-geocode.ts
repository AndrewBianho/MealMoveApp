// One-time backfill: restaurants created before address-geocoding sit at
// lat:0,lng:0 ("null island"). Geocode each one's address onto the map; if it
// can't be located, drop it on campus center so it's at least in the right city.
// Idempotent — only touches rows still at 0,0. Run with:  npx tsx prisma/backfill-geocode.ts
//
// Self-contained on purpose: it can't import lib/geocode.ts (that module is
// "server-only" and would throw in a plain script), so the fetch is inlined.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAMPUS = { lat: 40.04, lng: -75.34 };
const TOKEN = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = address?.trim();
  if (!query || !TOKEN) return null;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?limit=1&country=us&proximity=${CAMPUS.lng},${CAMPUS.lat}&access_token=${TOKEN}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: { center?: [number, number] }[] };
    const center = data.features?.[0]?.center;
    if (!center || center.length !== 2) return null;
    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function main() {
  const stranded = await prisma.restaurant.findMany({
    where: { lat: 0, lng: 0 },
    select: { id: true, name: true, address: true },
  });

  if (stranded.length === 0) {
    console.log("No restaurants at 0,0 — nothing to backfill.");
    return;
  }
  if (!TOKEN) {
    console.warn("No MAPBOX_TOKEN/NEXT_PUBLIC_MAPBOX_TOKEN set — using campus center for all.");
  }

  for (const r of stranded) {
    const geo = (await geocode(r.address)) ?? CAMPUS;
    const located = geo !== CAMPUS;
    await prisma.restaurant.update({
      where: { id: r.id },
      data: { lat: geo.lat, lng: geo.lng },
    });
    console.log(
      `${located ? "located" : "campus "} · ${r.name} (${r.address}) → ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`
    );
  }
  console.log(`\nBackfilled ${stranded.length} restaurant(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
