"use client";

import { useState, useTransition } from "react";
import { cn } from "./cn";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { AlertTriangle } from "./icons";
import { RetrievalHoursDisplay } from "./RetrievalHoursDisplay";
import { TimeWheelSheet } from "./TimeWheelSheet";
import { updateRetrievalHours } from "@/app/actions";
import {
  DAY_KEYS,
  DAY_LABELS,
  parseStoredHours,
  snap15,
  to12h,
  validateWeek,
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

type PickerTarget = { day: DayKey; i: number; which: "open" | "close" };

// Lets a drop-off (or an org admin) set weekly food-retrieval hours. Each day has
// an explicit open/closed switch and one or more time windows; a "copy to all
// days" shortcut fills a whole week from one day (the common case for a place
// with the same hours daily). Times are set with an iOS-style wheel picker, and
// invalid/overlapping hours are flagged inline (and re-checked on the server).
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
  const [errors, setErrors] = useState<Partial<Record<DayKey, string>>>({});
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  const hasBanner = Object.keys(errors).length > 0;

  // Editing any part of a day clears its stale error (and the banner with it once
  // no days remain flagged), so feedback never lingers past a fix.
  function clearDayError(day: DayKey) {
    setErrors((e) => {
      if (!(day in e)) return e;
      const next = { ...e };
      delete next[day];
      return next;
    });
  }

  function toggleDay(day: DayKey) {
    setHours((h) => ({
      ...h,
      [day]: h[day].length > 0 ? [] : [{ ...DEFAULT_WINDOW }],
    }));
    clearDayError(day);
  }
  function addWindow(day: DayKey) {
    setHours((h) => ({
      ...h,
      [day]: [...h[day], { ...(h[day].length ? SECOND_WINDOW : DEFAULT_WINDOW) }],
    }));
    clearDayError(day);
  }
  function removeWindow(day: DayKey, i: number) {
    setHours((h) => ({ ...h, [day]: h[day].filter((_, idx) => idx !== i) }));
    clearDayError(day);
  }
  function setTime(day: DayKey, i: number, field: "open" | "close", value: string) {
    setHours((h) => ({
      ...h,
      [day]: h[day].map((w, idx) => (idx === i ? { ...w, [field]: value } : w)),
    }));
    clearDayError(day);
  }
  function copyToAll(day: DayKey) {
    setHours((h) => {
      const src = h[day].map((w) => ({ ...w }));
      const next = emptyWeek();
      for (const d of DAY_KEYS) next[d] = src.map((w) => ({ ...w }));
      return next;
    });
    setErrors({});
    show(`Copied ${DAY_LABELS[day]}'s hours to every day.`);
  }

  function openPicker(day: DayKey, i: number, which: "open" | "close") {
    // Snap odd stored minutes onto a real wheel stop before the sheet opens.
    const current = hours[day][i][which];
    const snapped = snap15(current);
    if (snapped !== current) setTime(day, i, which, snapped);
    setPicker({ day, i, which });
  }

  function save() {
    const found = validateWeek(hours);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    startTransition(async () => {
      const res = await updateRetrievalHours(dropOffId, hours);
      if (res.ok) {
        setEditing(false);
        setErrors({});
        show("Retrieval hours updated.");
      } else {
        // Server rejected something the client check missed — surface it.
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
          {parsed ? "Edit opening times" : "Set your opening times"}
        </button>
      </div>
    );
  }

  const timeButton =
    "min-w-[92px] rounded-lg border border-neutral-300 bg-card px-3 py-2 text-center font-mono text-[13.5px] tabular-nums text-neutral-900 transition-colors hover:border-rescued-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400";

  return (
    <div className="mt-3">
      <ul className="divide-y divide-neutral-200/50">
        {DAY_KEYS.map((day) => {
          const open = hours[day].length > 0;
          const dayError = errors[day];
          return (
            <li key={day} className="grid grid-cols-[38px_40px_1fr] items-start gap-3 py-3">
              {/* Open / closed */}
              <button
                type="button"
                role="switch"
                aria-checked={open}
                aria-label={`${DAY_LABELS[day]} open`}
                onClick={() => toggleDay(day)}
                className={cn(
                  "relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150",
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
              <span className="mt-1 shrink-0 font-mono text-[13px] text-neutral-800">
                {DAY_LABELS[day]}
              </span>

              {open ? (
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                    {hours[day].map((w, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`${DAY_LABELS[day]} window ${i + 1} opens — ${to12h(w.open)}`}
                          onClick={() => openPicker(day, i, "open")}
                          className={timeButton}
                        >
                          {to12h(w.open)}
                        </button>
                        <span aria-hidden className="text-neutral-400">
                          –
                        </span>
                        <button
                          type="button"
                          aria-label={`${DAY_LABELS[day]} window ${i + 1} closes — ${to12h(w.close)}`}
                          onClick={() => openPicker(day, i, "close")}
                          className={timeButton}
                        >
                          {to12h(w.close)}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${DAY_LABELS[day]} window ${i + 1}`}
                          onClick={() => removeWindow(day, i)}
                          className="grid h-7 w-7 place-items-center rounded-md text-neutral-700 transition-colors hover:bg-failed-50 hover:text-failed-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                        >
                          <span aria-hidden className="text-base leading-none">
                            ×
                          </span>
                        </button>
                      </span>
                    ))}
                    {hours[day].length < MAX_WINDOWS && (
                      <button
                        type="button"
                        onClick={() => addWindow(day)}
                        className="-mx-1 rounded px-1 py-1 text-[12.5px] font-medium text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
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
                  {dayError && (
                    <p className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-failed-600">
                      <AlertTriangle className="shrink-0 text-[13px]" />
                      {dayError}
                    </p>
                  )}
                </div>
              ) : (
                <span className="mt-1.5 font-mono text-[12.5px] italic text-neutral-700">
                  Closed
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {hasBanner && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-failed-200 bg-failed-50 px-3.5 py-3 text-[13px] font-semibold text-failed-600">
          <AlertTriangle className="mt-0.5 shrink-0 text-[15px]" />
          <span>
            Some days have overlapping or invalid hours. Fix the highlighted days
            to save.
          </span>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save hours"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setHours(parsed ?? emptyWeek());
            setErrors({});
            setEditing(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>

      {picker && (
        <TimeWheelSheet
          dayLabel={DAY_LABELS[picker.day]}
          which={picker.which}
          value={hours[picker.day][picker.i]?.[picker.which] ?? "09:00"}
          onChange={(hm) => setTime(picker.day, picker.i, picker.which, hm)}
          onClose={() => setPicker(null)}
        />
      )}

      <Toast message={message} />
    </div>
  );
}
