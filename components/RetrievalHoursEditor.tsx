"use client";

import { useState, useTransition } from "react";
import { cn } from "./cn";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { RetrievalHoursDisplay } from "./RetrievalHoursDisplay";
import { updateRetrievalHours } from "@/app/actions";
import {
  DAY_KEYS,
  DAY_LABELS,
  parseStoredHours,
  type DayKey,
  type HourWindow,
  type RetrievalHours,
} from "@/lib/hours";

function emptyWeek(): RetrievalHours {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

const DEFAULT_WINDOW: HourWindow = { open: "09:00", close: "17:00" };
const SECOND_WINDOW: HourWindow = { open: "17:00", close: "19:00" };
const MAX_WINDOWS = 3;

// Lets a drop-off (or an org admin) set weekly food-retrieval hours. Each day has
// an explicit open/closed switch and one or more time windows; a "copy to all
// days" shortcut fills a whole week from one day (the common case for a place
// with the same hours daily). Mirrors the DropOffNotesEditor edit-toggle pattern.
export function RetrievalHoursEditor({
  dropOffId,
  initialHours,
}: {
  dropOffId: string;
  initialHours: unknown;
}) {
  const parsed = parseStoredHours(initialHours);
  const [hours, setHours] = useState<RetrievalHours>(parsed ?? emptyWeek());
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  function toggleDay(day: DayKey) {
    setHours((h) => ({
      ...h,
      [day]: h[day].length > 0 ? [] : [{ ...DEFAULT_WINDOW }],
    }));
  }
  function addWindow(day: DayKey) {
    setHours((h) => ({
      ...h,
      [day]: [...h[day], { ...(h[day].length ? SECOND_WINDOW : DEFAULT_WINDOW) }],
    }));
  }
  function removeWindow(day: DayKey, i: number) {
    setHours((h) => ({ ...h, [day]: h[day].filter((_, idx) => idx !== i) }));
  }
  function setTime(day: DayKey, i: number, field: "open" | "close", value: string) {
    setHours((h) => ({
      ...h,
      [day]: h[day].map((w, idx) => (idx === i ? { ...w, [field]: value } : w)),
    }));
  }
  function copyToAll(day: DayKey) {
    setHours((h) => {
      const src = h[day].map((w) => ({ ...w }));
      const next = emptyWeek();
      for (const d of DAY_KEYS) next[d] = src.map((w) => ({ ...w }));
      return next;
    });
    show(`Copied ${DAY_LABELS[day]}'s hours to every day.`);
  }

  function save() {
    startTransition(async () => {
      const res = await updateRetrievalHours(dropOffId, hours);
      if (res.ok) {
        setEditing(false);
        show("Retrieval hours updated.");
      } else {
        show(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="mt-3">
        <RetrievalHoursDisplay hours={parsed} />
        <button
          onClick={() => setEditing(true)}
          className="-mx-1 mt-2 inline-block rounded px-1 py-2 text-xs font-medium text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          {parsed ? "Edit retrieval hours" : "Set your retrieval hours"}
        </button>
      </div>
    );
  }

  const timeInput =
    "h-8 rounded-md border border-neutral-300 bg-card px-2 font-mono text-xs tabular-nums text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400";

  return (
    <div className="mt-3">
      <ul className="divide-y divide-neutral-200/50">
        {DAY_KEYS.map((day) => {
          const open = hours[day].length > 0;
          return (
            <li key={day} className="flex items-start gap-3 py-2">
              {/* Open / closed */}
              <button
                type="button"
                role="switch"
                aria-checked={open}
                aria-label={`${DAY_LABELS[day]} open`}
                onClick={() => toggleDay(day)}
                className={cn(
                  "relative mt-0.5 h-[22px] w-9 shrink-0 rounded-full transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2",
                  open ? "bg-rescued-600" : "bg-neutral-300"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-[left] duration-150",
                    open ? "left-[19px]" : "left-[3px]"
                  )}
                />
              </button>
              <span className="mt-1 w-8 shrink-0 font-mono text-xs text-neutral-800">
                {DAY_LABELS[day]}
              </span>

              {open ? (
                <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
                  {hours[day].map((w, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} window ${i + 1} opens`}
                        value={w.open}
                        onChange={(e) => setTime(day, i, "open", e.target.value)}
                        className={timeInput}
                      />
                      <span className="text-neutral-700">–</span>
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} window ${i + 1} closes`}
                        value={w.close}
                        onChange={(e) => setTime(day, i, "close", e.target.value)}
                        className={timeInput}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${DAY_LABELS[day]} window ${i + 1}`}
                        onClick={() => removeWindow(day, i)}
                        className="grid h-6 w-6 place-items-center rounded text-neutral-700 hover:bg-failed-50 hover:text-failed-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {hours[day].length < MAX_WINDOWS && (
                    <button
                      type="button"
                      onClick={() => addWindow(day)}
                      className="-mx-1 rounded px-1 py-1 text-xs font-medium text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                    >
                      + add hours
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => copyToAll(day)}
                    className="ml-auto rounded px-1 py-1 font-mono text-[11px] text-clay-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                  >
                    copy to all days
                  </button>
                </div>
              ) : (
                <span className="mt-1 flex-1 font-mono text-xs italic text-neutral-700">
                  Closed
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save hours"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setHours(parsed ?? emptyWeek());
            setEditing(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      <Toast message={message} />
    </div>
  );
}
