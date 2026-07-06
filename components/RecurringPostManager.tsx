"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { Calendar, Clock, X } from "./icons";
import {
  createRecurringPost,
  setRecurringPostActive,
  deleteRecurringPost,
} from "@/app/actions";
import {
  describeSchedule,
  minutesToClock,
  occurrencesWithin,
  WEEKDAY_LABELS,
} from "@/lib/recurring";
import type { RecurringPostView } from "@/lib/types";

// Pickup-window options, mirroring the one-off post form.
const WINDOWS = [
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];

// Day-set presets — shortcuts into the same day strip, never stored as a
// separate "mode" (the day set stays the single source of truth).
const DAILY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];
const PRESETS = [
  { label: "Daily", days: DAILY },
  { label: "Weekdays", days: WEEKDAYS },
  { label: "Weekends", days: WEEKENDS },
];

// "When is the next one, from right now?" — the concrete answer a restaurant
// scans a schedule card for. 8-day horizon always contains the next firing.
function nextOccurrenceLabel(s: RecurringPostView): string | null {
  const next = occurrencesWithin(
    {
      daysOfWeek: s.daysOfWeek,
      timeOfDay: s.timeOfDay,
      windowMinutes: s.windowMinutes,
    },
    8
  )[0];
  if (!next) return null;
  const days = Math.round(
    (new Date(next.availableAt).setHours(0, 0, 0, 0) -
      new Date().setHours(0, 0, 0, 0)) /
      86_400_000
  );
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : WEEKDAY_LABELS[next.availableAt.getDay()];
  return `next ${day} ${minutesToClock(s.timeOfDay)}`;
}

// "HH:MM" (from <input type="time">) ↔ minutes-from-midnight.
function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function RecurringPostManager({
  restaurantId,
  schedules,
}: {
  restaurantId: string;
  schedules: RecurringPostView[];
}) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("");
  const [days, setDays] = useState<Set<number>>(new Set(WEEKDAYS));
  const [time, setTime] = useState("20:00");
  const [windowMin, setWindowMin] = useState(WINDOWS[1].minutes);
  const [notes, setNotes] = useState("");

  const servingsNum = Number(servings);
  const valid = title.trim().length > 0 && servingsNum > 0 && days.size > 0;

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function submit() {
    if (!valid) return;
    const name = title.trim();
    startTransition(async () => {
      const res = await createRecurringPost({
        restaurantId,
        title: name,
        servings: servingsNum,
        daysOfWeek: Array.from(days),
        timeOfDay: clockToMinutes(time),
        windowMinutes: windowMin,
        notes: notes.trim() || undefined,
      });
      if (res.ok) {
        show(`Scheduled “${name}” — upcoming pickups are on the feed.`);
        setTitle("");
        setServings("");
        setNotes("");
        setDays(new Set(WEEKDAYS));
        setTime("20:00");
        setWindowMin(WINDOWS[1].minutes);
      } else {
        show(res.error);
      }
    });
  }

  function togglePaused(s: RecurringPostView) {
    startTransition(async () => {
      const res = await setRecurringPostActive(s.id, !s.active);
      if (!res.ok) show(res.error);
    });
  }

  function remove(s: RecurringPostView) {
    startTransition(async () => {
      const res = await deleteRecurringPost(s.id);
      show(res.ok ? "Schedule removed." : res.error);
    });
  }

  const labelCls =
    "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-700";
  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm " +
    "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";

  const daysMatch = (a: Set<number>, b: number[]) =>
    a.size === b.length && b.every((d) => a.has(d));

  return (
    <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Calendar className="text-clay-600" />
        Recurring posts
      </h2>
      <p className="mb-4 text-sm text-neutral-700">
        Set surplus that repeats — daily, weekly, or on the days you choose.
        Volunteers see each pickup ahead of time and can claim it once it opens.
      </p>

      {/* Existing schedules */}
      {schedules.length > 0 && (
        <ul className="mb-5 space-y-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className={cn(
                "rounded-lg border border-neutral-200/60 px-3 py-2.5",
                !s.active && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {s.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {/* Week strip — the whole cadence in one glance. */}
                    <span
                      className="flex items-center gap-[3px]"
                      aria-label={describeSchedule(s.daysOfWeek, s.timeOfDay)}
                    >
                      {WEEKDAY_LABELS.map((label, d) => {
                        const on = s.daysOfWeek.includes(d);
                        return (
                          <span
                            key={d}
                            aria-hidden="true"
                            className={cn(
                              "grid h-5 w-5 place-items-center rounded-[5px] font-mono text-[10px] leading-none",
                              on
                                ? "bg-rescued-100 font-semibold text-rescued-800"
                                : "bg-neutral-100 text-neutral-400"
                            )}
                          >
                            {label[0]}
                          </span>
                        );
                      })}
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-700"
                    >
                      <Clock className="text-[0.95em]" />
                      {minutesToClock(s.timeOfDay)}
                      <span className="text-neutral-500">·</span>
                      {s.servings} servings
                    </span>
                  </div>
                  {s.active && nextOccurrenceLabel(s) && (
                    <p className="mt-1 font-mono text-[11px] text-clay-800">
                      {nextOccurrenceLabel(s)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => togglePaused(s)}
                    disabled={isPending}
                    className="rounded-full px-2.5 py-2 font-mono text-[10px] uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                  >
                    {s.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s)}
                    disabled={isPending}
                    aria-label={`Remove ${s.title} schedule`}
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-failed-50 hover:text-failed-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                  >
                    <X />
                  </button>
                </div>
              </div>
              {!s.active && (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                  paused — not generating pickups
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* New schedule */}
      <div className="space-y-4 border-t border-neutral-200/40 pt-4">
        <div>
          <label className={labelCls} htmlFor="rp-title">
            What&apos;s available
          </label>
          <input
            id="rp-title"
            className={fieldCls}
            placeholder="e.g. End-of-day pastries"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="rp-servings">
            Servings
          </label>
          <input
            id="rp-servings"
            type="number"
            min={1}
            className={fieldCls}
            placeholder="0"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>

        <div>
          <span className={labelCls}>Repeats on</span>
          <div className="mb-2 flex gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDays(new Set(p.days))}
                aria-pressed={daysMatch(days, p.days)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  daysMatch(days, p.days)
                    ? "border-neutral-900 bg-neutral-900 text-neutral-50"
                    : "border-neutral-200/60 text-neutral-700 hover:bg-neutral-100"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, d) => {
              const on = days.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={on}
                  aria-label={label}
                  className={cn(
                    "h-9 flex-1 rounded-md border text-xs font-semibold transition-colors",
                    on
                      ? "border-rescued-600 bg-rescued-50 text-rescued-800"
                      : "border-neutral-200/60 text-neutral-700 hover:bg-neutral-100"
                  )}
                >
                  {label[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="rp-time">
              Goes live at
            </label>
            <input
              id="rp-time"
              type="time"
              className={fieldCls}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="rp-window">
              Pickup within
            </label>
            <select
              id="rp-window"
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
          <label className={labelCls} htmlFor="rp-notes">
            Special requests / restraints{" "}
            <span className="text-neutral-600">(optional)</span>
          </label>
          <textarea
            id="rp-notes"
            rows={2}
            className={fieldCls}
            placeholder="e.g. ring the back door · keep refrigerated"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <p className="font-mono text-[11px] text-neutral-700">
          {valid
            ? `${describeSchedule(Array.from(days), clockToMinutes(time))} · open ${
                WINDOWS.find((w) => w.minutes === windowMin)?.label ?? ""
              }`
            : "Pick a name, servings, and at least one day."}
        </p>

        <Button
          variant="primary"
          onClick={submit}
          disabled={!valid || isPending}
          className={cn("w-full", (!valid || isPending) && "opacity-50")}
        >
          {isPending ? "Saving…" : "Add recurring post"}
        </Button>
      </div>

      <Toast message={message} />
    </div>
  );
}
