// The rescue map's trip model: four named slots, not a list.
//
// A volunteer runs one rescue at a time, so the planner is deliberately unable
// to express a longer chain — a free multi-stop list could produce a trip the
// app has no way to claim. The itinerary UI renders these slots as rows, which
// is a presentation choice; the model stays fixed.
//
// Pure and dependency-free so `npm test` can exercise it (the test script globs
// lib/*.test.ts only). All functions return new objects — never mutate a plan.

export type Stop =
  | { kind: "place"; center: [number, number]; label: string }
  | { kind: "rest" | "drop"; id: string; center: [number, number]; label: string };

export type EntityStop = Extract<Stop, { kind: "rest" | "drop" }>;

export type SlotName = "start" | "pickup" | "dropOff" | "end";

export interface TripPlan {
  start: Stop;
  pickup: Stop | null;
  dropOff: Stop | null;
  end: Stop | null;
}

/** Malvern Prep — the chapter's home base, matching RescueMap's MY_DEFAULT. */
export const DEFAULT_START: Stop = {
  kind: "place",
  center: [-75.51239, 40.02724],
  label: "Malvern Prep",
};

export function emptyTrip(start: Stop = DEFAULT_START): TripPlan {
  return { start, pickup: null, dropOff: null, end: null };
}

export function slotForKind(kind: "rest" | "drop"): "pickup" | "dropOff" {
  return kind === "rest" ? "pickup" : "dropOff";
}

export function setSlot(plan: TripPlan, slot: SlotName, stop: Stop | null): TripPlan {
  // `start` is structurally non-null; clearing it falls back to the default
  // rather than leaving the trip without an origin.
  if (slot === "start") return { ...plan, start: stop ?? DEFAULT_START };
  return { ...plan, [slot]: stop };
}

/**
 * Clicking a pin. Fills the slot for that entity kind, replacing whatever was
 * there — clicking a second restaurant swaps the pickup rather than raising an
 * error the user has to resolve. Clicking the pin already in the slot clears it.
 */
export function toggleEntity(plan: TripPlan, stop: EntityStop): TripPlan {
  const slot = slotForKind(stop.kind);
  const current = plan[slot];
  const same = current && current.kind === stop.kind && "id" in current && current.id === stop.id;
  return setSlot(plan, slot, same ? null : stop);
}

/** Resets the journey but keeps where the volunteer is starting from. */
export function clearTrip(plan: TripPlan): TripPlan {
  return { start: plan.start, pickup: null, dropOff: null, end: null };
}

function isStop(v: unknown): v is Stop {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (s.kind !== "place" && s.kind !== "rest" && s.kind !== "drop") return false;
  if (typeof s.label !== "string") return false;
  const c = s.center;
  if (!Array.isArray(c) || c.length !== 2) return false;
  if (typeof c[0] !== "number" || typeof c[1] !== "number") return false;
  if (s.kind !== "place" && typeof s.id !== "string") return false;
  return true;
}

/**
 * Rebuild a plan from storage. A stored `rest`/`drop` stop whose entity has
 * since disappeared (listing expired, location removed) is dropped to null —
 * a stale id must never render a row the user cannot act on.
 */
export function hydrateTrip(
  raw: unknown,
  knownRestIds: Set<string>,
  knownDropIds: Set<string>
): TripPlan {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return emptyTrip();
    }
  }
  if (!parsed || typeof parsed !== "object") return emptyTrip();
  const p = parsed as Record<string, unknown>;

  const keep = (v: unknown): Stop | null => {
    if (!isStop(v)) return null;
    if (v.kind === "rest") return knownRestIds.has(v.id) ? v : null;
    if (v.kind === "drop") return knownDropIds.has(v.id) ? v : null;
    return v;
  };

  return {
    start: isStop(p.start) ? p.start : DEFAULT_START,
    pickup: keep(p.pickup),
    dropOff: keep(p.dropOff),
    end: keep(p.end),
  };
}
