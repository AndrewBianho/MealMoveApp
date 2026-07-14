import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { milesBetween } from "./geo";
import type { World } from "./announcements";

// Who an org-admin update goes to. Every audience is a filter over the same
// base — active volunteers in the admin's world — so demo/real never mix.
//
// NON-PUNITIVE BY CONSTRUCTION (PRODUCT.md: "reliability is felt, not
// punished"): the reliability bands exist to aim *support*, never to grade or
// rank a person. Bands are named by their literal percentage threshold — a
// measurement, not a letter grade — and they stay admin-only: callers surface
// a count, no name or individual percentage leaves this module, and the
// volunteer's own inbox never renders the audience label.

export type ReliabilityBand = "needs_support" | "finding_footing" | "star";
export type LapsedDays = 14 | 30 | 60;
export type RadiusMi = 2 | 5 | 10;
export type AnchorKind = "restaurant" | "dropoff";

export type Audience =
  | { kind: "everyone" }
  | { kind: "reliability"; band: ReliabilityBand }
  | { kind: "new" }
  | { kind: "lapsed"; days: LapsedDays }
  | { kind: "near"; anchor: { kind: AnchorKind; id: string }; radiusMi: RadiusMi };

export const RELIABILITY_BANDS: readonly ReliabilityBand[] = [
  "needs_support",
  "finding_footing",
  "star",
];
export const LAPSED_DAYS: readonly LapsedDays[] = [14, 30, 60];
export const RADII: readonly RadiusMi[] = [2, 5, 10];

const BAND_LABEL: Record<ReliabilityBand, string> = {
  needs_support: "Low reliability · under 50%",
  finding_footing: "Medium reliability · 50–79%",
  star: "High reliability · 80%+",
};

// The reliability meter's existing thresholds — sage ≥80 / honey 50–79 /
// tomato <50. Reused, not reinvented.
function bandOf(pct: number): ReliabilityBand {
  if (pct >= 80) return "star";
  if (pct >= 50) return "finding_footing";
  return "needs_support";
}

export interface ResolvedAudience {
  ids: string[];
  label: string;
}

type SegDb = Pick<
  PrismaClient,
  "user" | "listingEvent" | "pickup" | "restaurant" | "dropOff"
>;

const MS_PER_DAY = 86_400_000;

async function findAnchor(
  db: SegDb,
  anchor: { kind: AnchorKind; id: string },
  demo: boolean
): Promise<{ name: string; lat: number; lng: number } | null> {
  // Scoped by `demo`, so an anchor from the other world simply isn't found and
  // the audience resolves to nobody.
  const row =
    anchor.kind === "restaurant"
      ? await db.restaurant.findFirst({
          where: { id: anchor.id, demo },
          select: { name: true, lat: true, lng: true },
        })
      : await db.dropOff.findFirst({
          where: { id: anchor.id, demo },
          select: { name: true, lat: true, lng: true },
        });
  return row ?? null;
}

export async function resolveAudience(
  audience: Audience,
  world: World,
  deps: { db?: SegDb; now?: Date } = {}
): Promise<ResolvedAudience> {
  const db = deps.db ?? prisma;
  const now = deps.now ?? new Date();
  const demo = world === "demo";

  // One base set, filtered five ways.
  const base = await db.user.findMany({
    where: { role: "volunteer", status: "active", dataMode: world },
    select: { id: true, lat: true, lng: true },
  });

  switch (audience.kind) {
    case "everyone":
      return { ids: base.map((v) => v.id), label: "Everyone" };

    case "reliability": {
      // Same signal as the reliability meter: a delivered event counts for a
      // volunteer; a released (hold expired) or failed one counts against.
      const rows = await db.listingEvent.groupBy({
        by: ["actorId", "type"],
        where: {
          actorId: { not: null },
          type: { in: ["delivered", "released", "failed"] },
          listing: { demo },
        },
        _count: { _all: true },
      });

      const tally = new Map<string, { delivered: number; flaked: number }>();
      for (const r of rows) {
        if (!r.actorId) continue;
        const t = tally.get(r.actorId) ?? { delivered: 0, flaked: 0 };
        if (r.type === "delivered") t.delivered += r._count._all;
        else t.flaked += r._count._all;
        tally.set(r.actorId, t);
      }

      const ids = base
        .filter((v) => {
          const t = tally.get(v.id);
          // No history at all → they're `new`, never sorted into a band.
          if (!t) return false;
          const total = t.delivered + t.flaked;
          if (total === 0) return false;
          return bandOf(Math.round((t.delivered / total) * 100)) === audience.band;
        })
        .map((v) => v.id);

      return { ids, label: BAND_LABEL[audience.band] };
    }

    case "new": {
      // `new` means a true first-timer: NO terminal event history at all. A
      // volunteer who claimed and flaked (only `released`/`failed`, no
      // `delivered`) still has history, so they belong to a reliability band
      // (and its encouragement message), not a welcome — this keeps `new`
      // and the bands disjoint (PRODUCT.md: never send a welcome to a flaker).
      const done = await db.listingEvent.findMany({
        where: {
          actorId: { not: null },
          type: { in: ["delivered", "released", "failed"] },
          listing: { demo },
        },
        select: { actorId: true },
        distinct: ["actorId"],
      });
      const hasHistory = new Set(done.map((e) => e.actorId));
      return {
        ids: base.filter((v) => !hasHistory.has(v.id)).map((v) => v.id),
        label: "New volunteers",
      };
    }

    case "lapsed": {
      const cutoff = new Date(now.getTime() - audience.days * MS_PER_DAY);
      // A pickup's second seat (buddyId) is a claim too — a volunteer who
      // only ever rode as a buddy must still count as having claimed, or
      // they can never leave `new`/never-claimed limbo. Build the "most
      // recent claim" map across both seats in memory.
      const rows = await db.pickup.findMany({
        where: { listing: { demo } },
        select: { volunteerId: true, buddyId: true, claimedAt: true },
      });
      const lastClaim = new Map<string, Date>();
      const bump = (id: string | null, at: Date | null) => {
        if (!id || !at) return;
        const prev = lastClaim.get(id);
        if (!prev || at > prev) lastClaim.set(id, at);
      };
      for (const r of rows) {
        bump(r.volunteerId, r.claimedAt);
        bump(r.buddyId, r.claimedAt);
      }

      const ids = base
        .filter((v) => {
          const at = lastClaim.get(v.id);
          // Never claimed → they're `new`, not lapsed.
          if (!at) return false;
          return at < cutoff;
        })
        .map((v) => v.id);

      return { ids, label: `Quiet lately · ${audience.days}+ days` };
    }

    case "near": {
      const anchor = await findAnchor(db, audience.anchor, demo);
      if (!anchor) return { ids: [], label: "Volunteers near a location" };
      const ids = base
        .filter(
          (v) =>
            v.lat !== null &&
            v.lng !== null &&
            milesBetween(v.lat, v.lng, anchor.lat, anchor.lng) <= audience.radiusMi
        )
        .map((v) => v.id);
      return {
        ids,
        label: `Volunteers near ${anchor.name} · ${audience.radiusMi} mi`,
      };
    }
  }
}

export async function countAudience(
  audience: Audience,
  world: World,
  deps: { db?: SegDb; now?: Date } = {}
): Promise<number> {
  return (await resolveAudience(audience, world, deps)).ids.length;
}

// Server-side validation: an audience arrives from the client, so never trust
// its shape. Returns null for anything not in the allowed sets.
export function cleanAudience(input: unknown): Audience | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;

  switch (a.kind) {
    case "everyone":
      return { kind: "everyone" };
    case "new":
      return { kind: "new" };
    case "reliability":
      return RELIABILITY_BANDS.includes(a.band as ReliabilityBand)
        ? { kind: "reliability", band: a.band as ReliabilityBand }
        : null;
    case "lapsed":
      return LAPSED_DAYS.includes(a.days as LapsedDays)
        ? { kind: "lapsed", days: a.days as LapsedDays }
        : null;
    case "near": {
      const anchor = a.anchor as Record<string, unknown> | undefined;
      const anchorOk =
        !!anchor &&
        (anchor.kind === "restaurant" || anchor.kind === "dropoff") &&
        typeof anchor.id === "string" &&
        anchor.id.length > 0;
      if (!anchorOk || !RADII.includes(a.radiusMi as RadiusMi)) return null;
      return {
        kind: "near",
        anchor: { kind: anchor.kind as AnchorKind, id: anchor.id as string },
        radiusMi: a.radiusMi as RadiusMi,
      };
    }
    default:
      return null;
  }
}
