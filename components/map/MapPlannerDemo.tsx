"use client";

import { useState } from "react";
import { LocationSearchField } from "./LocationSearchField";
import { TripItinerary } from "./TripItinerary";
import { useTripPlan } from "./useTripPlan";

const DEMO_RESTAURANTS = [
  { id: "r1", name: "Sunrise Bakery", lat: 40.036, lng: -75.52 },
  { id: "r2", name: "Corner Deli", lat: 40.041, lng: -75.498 },
];
const DEMO_DROPOFFS = [
  { id: "d1", name: "St. Mark's Shelter", lat: 40.019, lng: -75.535 },
  { id: "d2", name: "Paoli Community Fridge", lat: 40.043, lng: -75.482 },
];

const FIELD =
  "w-full rounded-xl border border-neutral-900/10 bg-card px-3 py-1.5 text-sm " +
  "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-rescued-400 focus-visible:ring-offset-1";

/** Styleguide-only harness: the planner's two new pieces with mock data. */
export function MapPlannerDemo() {
  const { plan, pickStop, setStop, clearAll } = useTripPlan({
    restaurants: DEMO_RESTAURANTS,
    dropOffs: DEMO_DROPOFFS,
  });
  const [query, setQuery] = useState("");

  return (
    <div className="max-w-[340px] space-y-4 rounded-2xl border border-neutral-900/10 bg-neutral-50 p-3.5">
      <LocationSearchField
        label="Your location"
        value={query}
        onChange={setQuery}
        onSelect={(stop) => setStop("start", stop)}
        restaurants={DEMO_RESTAURANTS}
        dropOffs={DEMO_DROPOFFS}
        recent={[]}
        placeholder="Try typing sun"
        inputClassName={FIELD}
      />
      <TripItinerary
        plan={plan}
        suggestions={
          plan.pickup && !plan.dropOff
            ? {
                slot: "dropOff",
                items: [
                  {
                    id: "d1",
                    name: "St. Mark's Shelter",
                    minutes: 8,
                    miles: 2.3,
                    recommended: true,
                  },
                  {
                    id: "d2",
                    name: "Paoli Community Fridge",
                    minutes: 14,
                    miles: 4.1,
                    recommended: false,
                  },
                ],
              }
            : !plan.pickup
              ? {
                  slot: "pickup",
                  items: [
                    {
                      id: "r1",
                      name: "Sunrise Bakery",
                      minutes: 6,
                      miles: 1.8,
                      recommended: true,
                    },
                    {
                      id: "r2",
                      name: "Corner Deli",
                      minutes: 11,
                      miles: 3.2,
                      recommended: false,
                    },
                  ],
                }
              : null
        }
        onPick={(slot, id) => {
          const src = slot === "pickup" ? DEMO_RESTAURANTS : DEMO_DROPOFFS;
          const hit = src.find((e) => e.id === id);
          if (hit) {
            pickStop({
              kind: slot === "pickup" ? "rest" : "drop",
              id: hit.id,
              center: [hit.lng, hit.lat],
              label: hit.name,
            });
          }
        }}
        onClearSlot={(slot) => setStop(slot, null)}
        onClearTrip={clearAll}
      />
    </div>
  );
}
