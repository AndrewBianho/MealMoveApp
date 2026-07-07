"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { Calendar, Clock, Pause, Pencil, Play, X } from "./icons";
import {
  createRecurringPost,
  setRecurringPostActive,
  deleteRecurringPost,
  updateRecurringPost,
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

// The values a schedule form collects — the shared payload for create + edit.
interface ScheduleValues {
  title: string;
  servings: number;
  daysOfWeek: number[];
  timeOfDay: number;
  windowMinutes: number;
  notes?: string;
}

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
function minutesToTimeInput(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const daysMatch = (a: Set<number>, b: number[]) =>
  a.size === b.length && b.every((d) => a.has(d));

const labelCls =
  "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-700";
const fieldCls =
  "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm " +
  "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-transit-400 focus-visible:ring-offset-1";

/**
 * The fields for one schedule — reused verbatim for creating a new schedule and
 * for editing an existing one. `initial` seeds the fields (edit mode) and flips
 * the footer to Cancel / Save (+ Delete); without it the form is the "new
 * schedule" form and resets itself after a successful add.
 */
function ScheduleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: RecurringPostView;
  submitLabel: string;
  onSubmit: (values: ScheduleValues) => Promise<{ ok: boolean; error?: string }>;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  // A plain saving flag rather than useTransition: the optimistic list updates
  // live in the parent and must run at urgent priority, so the form must NOT
  // wrap onSubmit in a transition (that would defer the parent's setState and
  // let the reconcile effect clobber it before it paints).
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [servings, setServings] = useState(initial ? String(initial.servings) : "");
  const [days, setDays] = useState<Set<number>>(
    new Set(initial?.daysOfWeek ?? WEEKDAYS)
  );
  const [time, setTime] = useState(
    initial ? minutesToTimeInput(initial.timeOfDay) : "20:00"
  );
  const [windowMin, setWindowMin] = useState(
    initial?.windowMinutes ?? WINDOWS[1].minutes
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

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
    if (!valid || saving) return;
    setError(null);
    setSaving(true);
    // Call onSubmit directly (no transition) so the parent's optimistic list
    // update lands at urgent priority and paints immediately.
    void onSubmit({
      title: title.trim(),
      servings: servingsNum,
      daysOfWeek: Array.from(days),
      timeOfDay: clockToMinutes(time),
      windowMinutes: windowMin,
      notes: notes.trim() || undefined,
    }).then((res) => {
      setSaving(false);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
      } else if (!initial) {
        // New-schedule form clears for the next entry; edit closes (parent).
        setTitle("");
        setServings("");
        setNotes("");
        setDays(new Set(WEEKDAYS));
        setTime("20:00");
        setWindowMin(WINDOWS[1].minutes);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor={`rp-title-${initial?.id ?? "new"}`}>
          What&apos;s available
        </label>
        <input
          id={`rp-title-${initial?.id ?? "new"}`}
          className={fieldCls}
          placeholder="e.g. End-of-day pastries"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor={`rp-servings-${initial?.id ?? "new"}`}>
          Servings
        </label>
        <input
          id={`rp-servings-${initial?.id ?? "new"}`}
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
          <label className={labelCls} htmlFor={`rp-time-${initial?.id ?? "new"}`}>
            Goes live at
          </label>
          <input
            id={`rp-time-${initial?.id ?? "new"}`}
            type="time"
            className={fieldCls}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={`rp-window-${initial?.id ?? "new"}`}>
            Pickup within
          </label>
          <select
            id={`rp-window-${initial?.id ?? "new"}`}
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
        <label className={labelCls} htmlFor={`rp-notes-${initial?.id ?? "new"}`}>
          Special requests / restraints{" "}
          <span className="text-neutral-600">(optional)</span>
        </label>
        <textarea
          id={`rp-notes-${initial?.id ?? "new"}`}
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

      {error && <p className="text-xs text-failed-600">{error}</p>}

      {initial ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={onCancel}
              className="flex-1 px-3 py-2 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={submit}
              disabled={!valid || saving}
              className={cn("flex-1 px-3 py-2 text-xs", (!valid || saving) && "opacity-50")}
            >
              {saving ? "Saving…" : submitLabel}
            </Button>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="w-full rounded-lg py-1.5 text-center font-mono text-[10px] uppercase tracking-wide text-failed-600 transition-colors hover:bg-failed-50"
            >
              Delete this schedule
            </button>
          )}
        </div>
      ) : (
        <Button
          variant="primary"
          type="button"
          onClick={submit}
          disabled={!valid || saving}
          className={cn("w-full", (!valid || saving) && "opacity-50")}
        >
          {saving ? "Saving…" : submitLabel}
        </Button>
      )}
    </div>
  );
}

export function RecurringPostManager({
  restaurantId,
  schedules,
}: {
  restaurantId: string;
  schedules: RecurringPostView[];
}) {
  const { message, show } = useToast();
  // Kept in sync with the server prop, but mutated optimistically so pause /
  // resume / edit / delete land instantly — the click never waits on the round
  // trip, and the revalidated prop reconciles seamlessly (no visible refresh).
  const [items, setItems] = useState(schedules);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => setItems(schedules), [schedules]);

  function togglePaused(s: RecurringPostView) {
    const next = !s.active;
    setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: next } : x)));
    startTransition(async () => {
      const res = await setRecurringPostActive(s.id, next);
      if (!res.ok) {
        show(res.error);
        setItems(schedules);
      }
    });
  }

  function remove(s: RecurringPostView) {
    setItems((prev) => prev.filter((x) => x.id !== s.id));
    if (editingId === s.id) setEditingId(null);
    startTransition(async () => {
      const res = await deleteRecurringPost(s.id);
      show(res.ok ? "Schedule removed." : res.error);
      if (!res.ok) setItems(schedules);
    });
  }

  function saveEdit(
    id: string,
    values: ScheduleValues
  ): Promise<{ ok: boolean; error?: string }> {
    // Apply + close instantly; the server write runs in the background.
    setItems((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              title: values.title,
              servings: values.servings,
              daysOfWeek: values.daysOfWeek,
              timeOfDay: values.timeOfDay,
              windowMinutes: values.windowMinutes,
              notes: values.notes,
            }
          : s
      )
    );
    setEditingId(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await updateRecurringPost({ id, ...values });
        if (res.ok) show("Schedule updated.");
        else {
          show(res.error);
          setItems(schedules);
        }
        resolve(res);
      });
    });
  }

  function createSchedule(
    values: ScheduleValues
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await createRecurringPost({ restaurantId, ...values });
        if (res.ok) {
          show(`Scheduled “${values.title}” — upcoming pickups are on the feed.`);
        } else {
          show(res.error);
        }
        resolve(res);
      });
    });
  }

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
      {items.length > 0 && (
        <ul className="mb-5 space-y-2">
          {items.map((s) => {
            const editing = editingId === s.id;
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5 transition-colors",
                  editing
                    ? "border-neutral-300 bg-neutral-50"
                    : s.active
                      ? "border-neutral-200/60"
                      : "border-neutral-200/60 bg-neutral-50"
                )}
              >
                {editing ? (
                  <ScheduleForm
                    initial={s}
                    submitLabel="Save changes"
                    onSubmit={(v) => saveEdit(s.id, v)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => remove(s)}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      {/* Content dims when paused so it reads as dormant; the
                          actions stay full-strength. */}
                      <div className={cn("min-w-0", !s.active && "opacity-60")}>
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
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => togglePaused(s)}
                          aria-label={
                            s.active
                              ? `Pause ${s.title} — stop generating pickups`
                              : `Resume ${s.title} — start generating pickups`
                          }
                          title={s.active ? "Pause" : "Resume"}
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-full text-[17px] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                            s.active
                              ? "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                              : "border border-rescued-200 bg-rescued-50 text-rescued-700 hover:bg-rescued-100"
                          )}
                        >
                          {s.active ? <Pause /> : <Play />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(s.id)}
                          aria-label={`Edit ${s.title}`}
                          title="Edit"
                          className="grid h-9 w-9 place-items-center rounded-full text-[17px] text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                        >
                          <Pencil />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(s)}
                          aria-label={`Remove ${s.title} schedule`}
                          title="Remove"
                          className="grid h-9 w-9 place-items-center rounded-full text-[17px] text-neutral-600 transition-colors hover:bg-failed-50 hover:text-failed-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                        >
                          <X />
                        </button>
                      </div>
                    </div>
                    {!s.active && (
                      <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                        <Pause className="text-[11px]" />
                        paused · not generating pickups
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* New schedule */}
      <div className="border-t border-neutral-200/40 pt-4">
        <ScheduleForm submitLabel="Add recurring post" onSubmit={createSchedule} />
      </div>

      <Toast message={message} />
    </div>
  );
}
