import { prisma } from "./prisma";

// The volunteer's one-tap "rescue accuracy" signal, captured after a delivery:
// was the food present and roughly as described? One source of truth for the
// three values so the form, the server sanitizer, and the aggregation can't
// drift apart. Stored on Pickup.rescueAccuracy (+ optional free-text note).

export type RescueAccuracy = "yes" | "partly" | "no";

export interface AccuracyOption {
  value: RescueAccuracy;
  /** Short, plain-language label shown on the one-tap control. */
  label: string;
}

// Ordered best → worst; the UI renders them left-to-right.
export const RESCUE_ACCURACY_OPTIONS: readonly AccuracyOption[] = [
  { value: "yes", label: "Yes, as described" },
  { value: "partly", label: "Partly off" },
  { value: "no", label: "Not there" },
];

const VALID = new Set<RescueAccuracy>(["yes", "partly", "no"]);

/** Longest note we store — a one-line aside, not an essay. */
export const ACCURACY_NOTE_MAX = 280;

/** Coerce an untrusted value to a known signal, or null. */
export function cleanRescueAccuracy(input: unknown): RescueAccuracy | null {
  return typeof input === "string" && VALID.has(input as RescueAccuracy)
    ? (input as RescueAccuracy)
    : null;
}

/** Trim and bound the optional note; empty/garbage becomes null. */
export function cleanAccuracyNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, ACCURACY_NOTE_MAX);
  return trimmed.length > 0 ? trimmed : null;
}

export interface AccuracyAggregate {
  total: number;
  yes: number;
  partly: number;
  no: number;
  /** Percent of signals that were "yes" (0–100), or null when none yet. */
  accuratePct: number | null;
}

/** Tally a set of signals into counts + an "as described" percentage. Pure. */
export function aggregateAccuracy(
  signals: readonly (RescueAccuracy | null | undefined)[]
): AccuracyAggregate {
  const out: AccuracyAggregate = {
    total: 0,
    yes: 0,
    partly: 0,
    no: 0,
    accuratePct: null,
  };
  for (const s of signals) {
    if (!s) continue;
    out.total += 1;
    out[s] += 1;
  }
  if (out.total > 0) out.accuratePct = Math.round((out.yes / out.total) * 100);
  return out;
}

type Db = Pick<typeof prisma, "pickup">;

/**
 * Aggregate every accuracy signal a restaurant has received across its
 * listings. Private operations metric — callers gate visibility to org-admin +
 * that restaurant.
 */
export async function restaurantAccuracy(
  restaurantId: string,
  db: Db = prisma
): Promise<AccuracyAggregate> {
  const rows = await db.pickup.findMany({
    where: {
      rescueAccuracy: { not: null },
      listing: { restaurantId },
    },
    select: { rescueAccuracy: true },
  });
  return aggregateAccuracy(rows.map((r) => r.rescueAccuracy as RescueAccuracy));
}

export interface RestaurantAccuracyRow {
  restaurantId: string;
  restaurantName: string;
  aggregate: AccuracyAggregate;
}

/**
 * Per-restaurant accuracy across every restaurant with at least one signal in
 * the given world (demo/real). The org-admin operations view; sorted by signal
 * count so the most-rescued partners surface first.
 */
export async function restaurantAccuracySummaries(
  demo: boolean,
  db: Db = prisma
): Promise<RestaurantAccuracyRow[]> {
  const rows = await db.pickup.findMany({
    where: { rescueAccuracy: { not: null }, listing: { demo } },
    select: {
      rescueAccuracy: true,
      listing: { select: { restaurantId: true, restaurant: { select: { name: true } } } },
    },
  });

  const byRestaurant = new Map<
    string,
    { name: string; signals: RescueAccuracy[] }
  >();
  for (const r of rows) {
    const id = r.listing.restaurantId;
    const entry = byRestaurant.get(id) ?? { name: r.listing.restaurant.name, signals: [] };
    entry.signals.push(r.rescueAccuracy as RescueAccuracy);
    byRestaurant.set(id, entry);
  }

  const out: RestaurantAccuracyRow[] = [];
  byRestaurant.forEach(({ name, signals }, restaurantId) => {
    out.push({
      restaurantId,
      restaurantName: name,
      aggregate: aggregateAccuracy(signals),
    });
  });
  return out.sort((a, b) => b.aggregate.total - a.aggregate.total);
}
