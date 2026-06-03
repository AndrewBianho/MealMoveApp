"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "./Button";
import { ListingCard } from "./ListingCard";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { postListing } from "@/app/actions";
import type { Listing } from "@/lib/types";

// Relative pickup windows → minutes. The expiry timestamp is computed
// server-side in the action from "now" + this value.
const WINDOWS = [
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];

export function RestaurantConsole({
  restaurant,
  restaurantId,
  listings,
}: {
  restaurant: string;
  restaurantId: string;
  listings: Listing[];
}) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("");
  const [windowMin, setWindowMin] = useState(WINDOWS[1].minutes);
  const [dropOff, setDropOff] = useState("");

  const servingsNum = Number(servings);
  const valid = title.trim().length > 0 && servingsNum > 0;

  function submit() {
    if (!valid) return;
    const name = title.trim();
    startTransition(async () => {
      await postListing({
        restaurantId,
        title: name,
        servings: servingsNum,
        minutes: windowMin,
        dropOffName: dropOff.trim() || undefined,
      });
      show(`Posted “${name}” — it's live on the volunteer feed.`);
      setTitle("");
      setServings("");
      setDropOff("");
      setWindowMin(WINDOWS[1].minutes);
    });
  }

  const live = useMemo(
    () => listings.filter((l) => l.status === "open" || l.status === "claimed"),
    [listings]
  );
  const past = useMemo(
    () =>
      listings.filter((l) =>
        ["in transit", "delivered", "expired", "failed"].includes(l.status)
      ),
    [listings]
  );

  const labelCls =
    "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-600";
  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-white px-3 py-2 text-sm " +
    "placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      {/* Post form */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-neutral-200/40 bg-white p-5">
          <h2 className="text-lg font-medium">Post surplus</h2>
          <p className="mb-4 text-sm text-neutral-600">Posting from {restaurant}.</p>

          <div className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="title">
                What&apos;s available
              </label>
              <input
                id="title"
                className={fieldCls}
                placeholder="e.g. Mediterranean wraps & salads"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="servings">
                  Servings
                </label>
                <input
                  id="servings"
                  type="number"
                  min={1}
                  className={fieldCls}
                  placeholder="0"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="window">
                  Pickup within
                </label>
                <select
                  id="window"
                  className={fieldCls}
                  value={windowMin}
                  onChange={(e) => setWindowMin(Number(e.target.value))}
                >
                  {WINDOWS.map((w) => (
                    <option key={w.minutes} value={w.minutes}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls} htmlFor="dropoff">
                Suggested drop-off{" "}
                <span className="text-neutral-400">(optional)</span>
              </label>
              <input
                id="dropoff"
                className={fieldCls}
                placeholder="e.g. Community Fridge — 4th & Elm"
                value={dropOff}
                onChange={(e) => setDropOff(e.target.value)}
              />
            </div>

            <Button
              variant="primary"
              onClick={submit}
              disabled={!valid || isPending}
              className={cn("w-full", (!valid || isPending) && "opacity-50")}
            >
              {isPending ? "Posting…" : "Post listing"}
            </Button>
          </div>
        </div>
      </div>

      {/* Their listings */}
      <div>
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-medium">Live & claimed</h2>
          <p className="mb-4 text-sm text-neutral-600">
            What volunteers can see right now.
          </p>
          {live.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {live.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-12 text-center text-sm text-neutral-600">
              Nothing posted yet. Add surplus from the form to the left.
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium">History</h2>
          {past.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {past.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">No past listings yet.</p>
          )}
        </section>
      </div>

      <Toast message={message} />
    </div>
  );
}
