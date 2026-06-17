"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "./Button";
import { ListingCard } from "./ListingCard";
import { ImageUploadField } from "./ImageUploadField";
import { RecurringPostManager } from "./RecurringPostManager";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { postListing, setRestaurantImage } from "@/app/actions";
import type { Listing, RecurringPostView } from "@/lib/types";

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
  restaurantImageUrl,
  listings,
  schedules,
}: {
  restaurant: string;
  restaurantId: string;
  restaurantImageUrl?: string | null;
  listings: Listing[];
  schedules: RecurringPostView[];
}) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("");
  const [weight, setWeight] = useState("");
  const [windowMin, setWindowMin] = useState(WINDOWS[1].minutes);
  const [notes, setNotes] = useState("");
  const [foodImage, setFoodImage] = useState<string | null>(null);

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
        weightLbs: Number(weight) > 0 ? Number(weight) : undefined,
        notes: notes.trim() || undefined,
        imageUrl: foodImage ?? undefined,
      });
      show(`Posted “${name}” — it's live on the volunteer feed.`);
      setTitle("");
      setServings("");
      setWeight("");
      setNotes("");
      setFoodImage(null);
      setWindowMin(WINDOWS[1].minutes);
    });
  }

  // Set/clear the restaurant's default image — used on a card when the listing
  // has no food photo of its own.
  function saveDefaultImage(url: string | null) {
    startTransition(async () => {
      const res = await setRestaurantImage(restaurantId, url);
      show(
        res.ok
          ? url
            ? "Default photo updated."
            : "Default photo removed."
          : res.error
      );
    });
  }

  // Live = open-now or claimed; exclude scheduled occurrences (those open in the
  // future and belong under "Scheduled" so the restaurant sees what's actually
  // claimable now separately from what's queued.
  const live = useMemo(
    () =>
      listings.filter(
        (l) => (l.status === "open" && !l.scheduled) || l.status === "claimed"
      ),
    [listings]
  );
  const upcoming = useMemo(
    () =>
      listings
        .filter((l) => l.status === "open" && l.scheduled)
        .sort((a, b) => (a.availableAt ?? 0) - (b.availableAt ?? 0)),
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
    "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-700";
  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm " +
    "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      {/* Post form */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {/* Restaurant default photo */}
        <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
          <h2 className="text-lg font-medium">Restaurant photo</h2>
          <p className="mb-4 text-sm text-neutral-700">
            Shown on a card when a listing has no food photo of its own.
          </p>
          <ImageUploadField
            label="Default photo"
            hint="Take a photo or upload one — JPG/PNG, up to 5 MB."
            value={restaurantImageUrl}
            onChange={saveDefaultImage}
          />
        </div>

        <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
          <h2 className="text-lg font-medium">Post surplus</h2>
          <p className="mb-4 text-sm text-neutral-700">Posting from {restaurant}.</p>

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
                <label className={labelCls} htmlFor="weight">
                  Weight (lbs) <span className="text-neutral-600">(optional)</span>
                </label>
                <input
                  id="weight"
                  type="number"
                  min={0}
                  step="0.1"
                  className={fieldCls}
                  placeholder="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
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

            <div>
              <label className={labelCls} htmlFor="notes">
                Special requests / restraints{" "}
                <span className="text-neutral-600">(optional)</span>
              </label>
              <textarea
                id="notes"
                rows={2}
                className={fieldCls}
                placeholder="e.g. contains nuts · keep upright · pick up at back door"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <ImageUploadField
              label="Food photo"
              hint="A photo of this food. Falls back to your restaurant photo."
              value={foodImage}
              onChange={setFoodImage}
            />

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

        <RecurringPostManager restaurantId={restaurantId} schedules={schedules} />
      </div>

      {/* Their listings */}
      <div>
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-medium">Live & claimed</h2>
          <p className="mb-4 text-sm text-neutral-700">
            What volunteers can see right now.
          </p>
          {live.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {live.map((l) => (
                <ListingCard key={l.id} listing={l} audience="restaurant" />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-card px-6 py-12 text-center text-sm text-neutral-700">
              Nothing posted yet. Add surplus from the form to the left.
            </div>
          )}
        </section>

        {upcoming.length > 0 && (
          <section className="mb-8">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-medium">Scheduled</h2>
              <span className="font-mono text-xs text-neutral-700">{upcoming.length}</span>
            </div>
            <p className="mb-4 text-sm text-neutral-700">
              From your recurring schedule — each opens to the volunteer feed at
              its listed time.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {upcoming.map((l) => (
                <ListingCard key={l.id} listing={l} audience="restaurant" />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-4 text-lg font-medium">History</h2>
          {past.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {past.map((l) => (
                <ListingCard key={l.id} listing={l} audience="restaurant" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-700">No past listings yet.</p>
          )}
        </section>
      </div>

      <Toast message={message} />
    </div>
  );
}
