"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { formatHour } from "@/lib/quietHours";
import { setQuietHours } from "@/app/actions";

// Lets a volunteer set a "don't ping me" window. Push and email both pause
// during these local hours — a calm default-respecting control against
// notification fatigue. Off until they turn it on.

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function QuietHoursControl({
  initialStart,
  initialEnd,
}: {
  initialStart: number | null;
  initialEnd: number | null;
}) {
  const [enabled, setEnabled] = useState(initialStart != null && initialEnd != null);
  const [start, setStart] = useState(initialStart ?? 22);
  const [end, setEnd] = useState(initialEnd ?? 7);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  function persist(nextEnabled: boolean, s: number, e: number) {
    startTransition(async () => {
      const res = await setQuietHours(nextEnabled ? s : null, nextEnabled ? e : null);
      show(
        res.ok
          ? nextEnabled
            ? `Quiet hours on, ${formatHour(s)} – ${formatHour(e)}.`
            : "Quiet hours off."
          : res.error
      );
    });
  }

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    persist(next, start, end);
  }

  const selectCls =
    "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400";

  return (
    <div>
      <Button variant={enabled ? "secondary" : "primary"} onClick={toggle} disabled={isPending}>
        {enabled ? "Turn off quiet hours" : "Turn on quiet hours"}
      </Button>

      {enabled && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block font-mono text-[10px] text-neutral-700">
              From
            </span>
            <select
              value={start}
              onChange={(e) => {
                const s = Number(e.target.value);
                setStart(s);
                persist(true, s, end);
              }}
              className={selectCls}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block font-mono text-[10px] text-neutral-700">
              Until
            </span>
            <select
              value={end}
              onChange={(e) => {
                const en = Number(e.target.value);
                setEnd(en);
                persist(true, start, en);
              }}
              className={selectCls}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <p className="mt-3 text-[13px] text-neutral-700">
        We&apos;ll hold push and email during this window and reach you afterward.
      </p>
      <Toast message={message} />
    </div>
  );
}
