"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearTrip,
  emptyTrip,
  hydrateTrip,
  setSlot,
  toggleEntity,
  type EntityStop,
  type SlotName,
  type Stop,
  type TripPlan,
} from "@/lib/tripPlan";

const KEY = "mm.trip";

interface Located {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * React wrapper over the pure model in lib/tripPlan.ts. Owns exactly two extra
 * concerns: localStorage, and knowing which entity ids currently exist so a
 * stored trip pointing at a vanished listing hydrates to an empty slot.
 *
 * `hydrated` starts false and flips after the mount effect, mirroring the
 * pattern ClaimHoldPanel uses for its clock: the server render and first client
 * render must agree, so nothing storage-dependent is read during render.
 */
export function useTripPlan({
  restaurants,
  dropOffs,
}: {
  restaurants: Located[];
  dropOffs: Located[];
}) {
  const [plan, setPlan] = useState<TripPlan>(() => emptyTrip());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Built inside the effect, not during render: the effect runs once, so
    // these are the mount-time ids — exactly what hydration should validate
    // against — and nothing mutates a ref mid-render.
    const restIds = new Set(restaurants.map((r) => r.id));
    const dropIds = new Set(dropOffs.map((d) => d.id));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPlan(hydrateTrip(raw, restIds, dropIds));
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
    // Mount-only by design: re-hydrating when the map data refetches would
    // clobber edits the volunteer has already made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(plan));
    } catch {
      /* ignore */
    }
  }, [plan, hydrated]);

  const pickStop = useCallback((stop: EntityStop) => {
    setPlan((p) => toggleEntity(p, stop));
  }, []);

  const setStop = useCallback((slot: SlotName, stop: Stop | null) => {
    setPlan((p) => setSlot(p, slot, stop));
  }, []);

  const clearAll = useCallback(() => setPlan((p) => clearTrip(p)), []);

  return { plan, pickStop, setStop, clearAll, hydrated };
}
