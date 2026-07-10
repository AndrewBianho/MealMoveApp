"use client";

import { useState, useTransition } from "react";
import { cn } from "./cn";
import { Toast, useToast } from "./Toast";
import { updateDropOffConstraints } from "@/app/actions";
import { capitalize } from "@/lib/text";
import type { FoodCategory } from "@/lib/types";

// What a drop-off can physically take in — the categories it accepts and whether
// it can hold cold/perishable food. Inline-editable with an optimistic save
// (mirrors NeedLevelControl): the location keeps its own intake rules current,
// which is what drives eligibility in the claim picker.
const CATEGORIES: FoodCategory[] = [
  "prepared",
  "produce",
  "bakery",
  "packaged",
  "dairy",
  "beverages",
];

type Snapshot = {
  categories: FoodCategory[];
  refrigerated: boolean;
};

export function DropOffConstraintsEditor({
  dropOffId,
  initial,
}: {
  dropOffId: string;
  initial: Snapshot;
}) {
  const [state, setState] = useState<Snapshot>(initial);
  const [saved, setSaved] = useState<Snapshot>(initial);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  // Optimistically apply `next`, persist the whole snapshot, and roll back to the
  // last-saved state if the server rejects it.
  function commit(next: Snapshot, okMsg: string) {
    const rollback = saved;
    setState(next);
    startTransition(async () => {
      const res = await updateDropOffConstraints(dropOffId, {
        acceptedCategories: next.categories,
        refrigerated: next.refrigerated,
      });
      if (res.ok) {
        setSaved(next);
        show(okMsg);
      } else {
        setState(rollback);
        show(res.error);
      }
    });
  }

  function toggleCategory(cat: FoodCategory) {
    const has = state.categories.includes(cat);
    const categories = has
      ? state.categories.filter((c) => c !== cat)
      : [...state.categories, cat];
    commit({ ...state, categories }, has ? `Stopped accepting ${cat}.` : `Now accepting ${cat}.`);
  }

  return (
    <div className="space-y-5">
      {/* Accepted food */}
      <div>
        <p className="mb-2 font-mono text-[11px] text-neutral-700">Accepted food</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const on = state.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={on}
                disabled={isPending}
                onClick={() => toggleCategory(cat)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-70",
                  on
                    ? "border-rescued-400 bg-rescued-50 text-rescued-800"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-4 w-4 place-items-center rounded-full text-[11px] leading-none transition-colors",
                    on ? "bg-rescued-600 text-white" : "border border-neutral-300 text-transparent"
                  )}
                >
                  ✓
                </span>
                {capitalize(cat)}
              </button>
            );
          })}
        </div>
        {state.categories.length === 0 && (
          <p className="mt-2 text-xs text-neutral-700">
            Nothing selected — volunteers can&apos;t be routed here until you accept
            at least one food type.
          </p>
        )}
      </div>

      {/* Refrigeration */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-800">Refrigeration</p>
          <p className="mt-0.5 text-xs text-neutral-700">Can hold cold or perishable food</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.refrigerated}
          aria-label="Refrigeration"
          disabled={isPending}
          onClick={() =>
            commit(
              { ...state, refrigerated: !state.refrigerated },
              state.refrigerated ? "Marked as ambient." : "Marked as refrigerated."
            )
          }
          className={cn(
            "relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 disabled:opacity-70",
            state.refrigerated ? "bg-rescued-600" : "bg-neutral-300"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150",
              state.refrigerated ? "left-[21px]" : "left-[3px]"
            )}
          />
        </button>
      </div>

      <Toast message={message} />
    </div>
  );
}
