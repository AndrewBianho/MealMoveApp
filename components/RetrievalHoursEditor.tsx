"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { RetrievalHoursDisplay } from "./RetrievalHoursDisplay";
import { updateRetrievalHours } from "@/app/actions";
import {
  DAY_KEYS,
  DAY_LABELS,
  parseStoredHours,
  type DayKey,
  type RetrievalHours,
} from "@/lib/hours";

function emptyWeek(): RetrievalHours {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

// Lets a drop-off admin set multi-window food-retrieval hours. Mirrors the
// DropOffNotesEditor pattern (useState + useTransition + Toast).
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

  function addWindow(day: DayKey) {
    setHours((h) => ({ ...h, [day]: [...h[day], { open: "09:00", close: "17:00" }] }));
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
          className="mt-1 text-xs font-medium text-rescued-600 hover:underline"
        >
          {parsed ? "Edit retrieval hours" : "Set your retrieval hours"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="space-y-2">
        {DAY_KEYS.map((day) => (
          <div key={day} className="flex items-start gap-2">
            <span className="w-10 pt-1.5 font-mono text-xs uppercase text-neutral-500">
              {DAY_LABELS[day]}
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {hours[day].length === 0 && (
                <span className="py-1.5 font-mono text-xs italic text-neutral-400">
                  closed
                </span>
              )}
              {hours[day].map((w, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <input
                    type="time"
                    value={w.open}
                    onChange={(e) => setTime(day, i, "open", e.target.value)}
                    className="rounded-md border border-neutral-200/60 bg-white px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
                  />
                  <span className="text-neutral-400">–</span>
                  <input
                    type="time"
                    value={w.close}
                    onChange={(e) => setTime(day, i, "close", e.target.value)}
                    className="rounded-md border border-neutral-200/60 bg-white px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${day} window`}
                    onClick={() => removeWindow(day, i)}
                    className="px-1 text-neutral-400 hover:text-failed-600"
                  >
                    ×
                  </button>
                </span>
              ))}
              {hours[day].length < 4 && (
                <button
                  type="button"
                  onClick={() => addWindow(day)}
                  className="rounded-full px-2 py-1 font-mono text-xs text-rescued-600 hover:underline"
                >
                  + add
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
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
