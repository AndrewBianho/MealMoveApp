import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { milesBetween } from "./geo";
import { dispatchToUser } from "./notify-dispatch";
import { buildBroadcastPayload } from "./notify";
import { quietHoursActive } from "./quietHours";

// The escalating-broadcast engine. Open listings shouldn't sit and rot waiting
// to be browsed: as a listing's pickup window narrows, we push it to a widening
// circle of volunteers. Reach grows with urgency, and each volunteer hears about
// a given listing at most once per band (deduped via the ListingBroadcast table).
//
// Bands mirror the urgency pill in the UI (see ListingCard): the same time-left
// thresholds drive both the badge a browser sees and who gets pinged.

export type Band = "open" | "soon" | "closing_soon";

export interface BroadcastConfig {
  /** `open` band: ping this many nearest volunteers, once. */
  nearestN: number;
  /** `soon` band: ping everyone within this radius. */
  soonRadiusKm: number;
  /** `closing_soon` band: last call — a wider radius. */
  lastCallRadiusKm: number;
}

export const DEFAULT_BROADCAST_CONFIG: BroadcastConfig = {
  nearestN: 3,
  soonRadiusKm: 5,
  lastCallRadiusKm: 15,
};

const KM_PER_MILE = 1.609344;

/**
 * Map a listing's minutes-left to its band, or null when it has no band worth
 * broadcasting (already expired — the sweep handles those). Thresholds match the
 * urgency pill: closing soon < 10m, soon < 35m, open otherwise.
 */
export function bandFor(minutesLeft: number): Band | null {
  if (minutesLeft < 0) return null;
  if (minutesLeft < 10) return "closing_soon";
  if (minutesLeft < 35) return "soon";
  return "open";
}

export interface Candidate {
  volunteerId: string;
  /** Distance to the pickup, or null if the volunteer has no known position. */
  miles: number | null;
}

/**
 * Who to reach for a listing in a given band. Pure: caller supplies candidates
 * already filtered to the listing's world (demo/real) and opt-in. Volunteers
 * without a known position are never distance-targeted.
 */
export function selectTargets(
  band: Band,
  candidates: Candidate[],
  config: BroadcastConfig = DEFAULT_BROADCAST_CONFIG
): string[] {
  const located = candidates.filter(
    (c): c is { volunteerId: string; miles: number } => c.miles !== null
  );
  if (band === "open") {
    return located
      .slice()
      .sort((a, b) => a.miles - b.miles)
      .slice(0, config.nearestN)
      .map((c) => c.volunteerId);
  }
  const radiusKm = band === "soon" ? config.soonRadiusKm : config.lastCallRadiusKm;
  return located
    .filter((c) => c.miles * KM_PER_MILE <= radiusKm)
    .map((c) => c.volunteerId);
}

// Minimal Prisma surface the pass touches — keeps the fake DB in tests small.
type BroadcastDb = Pick<PrismaClient, "foodListing" | "user" | "listingBroadcast">;

export interface EscalateDeps {
  db?: BroadcastDb;
  dispatch?: typeof dispatchToUser;
  now?: Date;
  config?: BroadcastConfig;
}

/**
 * One escalation pass over every claimable open listing. For each, computes the
 * band, picks targets, skips anyone already notified for that (listing, band),
 * records the new sends, and dispatches the push (with email fallback). Returns
 * a per-band count of fresh notifications.
 */
export async function escalateBroadcasts(deps: EscalateDeps = {}): Promise<{
  notified: number;
  byBand: Record<Band, number>;
}> {
  const db = deps.db ?? prisma;
  const dispatch = deps.dispatch ?? dispatchToUser;
  const now = deps.now ?? new Date();
  const config = deps.config ?? DEFAULT_BROADCAST_CONFIG;

  const byBand: Record<Band, number> = { open: 0, soon: 0, closing_soon: 0 };
  let notified = 0;

  // Listings that are claimable right now: open, window not yet passed, and not
  // a future-scheduled row still waiting on its availableAt.
  const listings = await db.foodListing.findMany({
    where: {
      status: "open",
      expiresAt: { gt: now },
      OR: [{ availableAt: null }, { availableAt: { lte: now } }],
    },
    select: {
      id: true,
      title: true,
      servings: true,
      demo: true,
      expiresAt: true,
      restaurant: { select: { lat: true, lng: true } },
    },
  });
  if (listings.length === 0) return { notified, byBand };

  // Opted-in, located volunteers — fetched once and filtered per listing world.
  // Volunteers currently in their quiet-hours window are held back here (rather
  // than suppressed at dispatch) so they aren't recorded as "notified" for this
  // band — a later pass can still reach them once their quiet hours end.
  const volunteers = (
    await db.user.findMany({
      where: {
        role: "volunteer",
        status: "active",
        notificationsEnabled: true,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        id: true,
        lat: true,
        lng: true,
        dataMode: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    })
  ).filter((v) => !quietHoursActive(v.quietHoursStart, v.quietHoursEnd, now));

  for (const listing of listings) {
    const minutesLeft = Math.floor(
      (listing.expiresAt.getTime() - now.getTime()) / 60_000
    );
    const band = bandFor(minutesLeft);
    if (!band) continue;

    const world = listing.demo ? "demo" : "real";
    const candidates: Candidate[] = volunteers
      .filter((v) => v.dataMode === world)
      .map((v) => ({
        volunteerId: v.id,
        miles:
          v.lat !== null && v.lng !== null
            ? milesBetween(v.lat, v.lng, listing.restaurant.lat, listing.restaurant.lng)
            : null,
      }));

    const targets = selectTargets(band, candidates, config);
    if (targets.length === 0) continue;

    // Dedupe against prior sends for this (listing, band).
    const already = await db.listingBroadcast.findMany({
      where: { listingId: listing.id, band, volunteerId: { in: targets } },
      select: { volunteerId: true },
    });
    const seen = new Set(already.map((a) => a.volunteerId));
    const fresh = targets.filter((id) => !seen.has(id));
    if (fresh.length === 0) continue;

    // Record first so a concurrent pass can't double-send, then dispatch.
    await db.listingBroadcast.createMany({
      data: fresh.map((volunteerId) => ({ listingId: listing.id, volunteerId, band })),
      skipDuplicates: true,
    });
    const payload = buildBroadcastPayload({
      listingId: listing.id,
      listingTitle: listing.title,
      servings: listing.servings,
      minutesLeft,
      band,
    });
    await Promise.all(fresh.map((id) => dispatch(id, payload)));

    byBand[band] += fresh.length;
    notified += fresh.length;
  }

  return { notified, byBand };
}
