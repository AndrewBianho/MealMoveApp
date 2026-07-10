"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import {
  buildTime,
  parseTime,
  to12h,
  type Meridiem,
} from "@/lib/hours";

// Wheel geometry: each stop is ITEM_H tall, and PAD_ITEMS blank rows top and
// bottom let the first/last real value scroll to the centered selection band.
const ITEM_H = 40;
const PAD_ITEMS = 2; // 2 × 40px = 80px padding, matching the 200px viewport.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
const MINUTES = [0, 15, 30, 45];
const MERIDIEMS: Meridiem[] = ["am", "pm"];

// One scrolling column. The selected value is read from scrollTop on scroll-end
// (debounced); arrow keys move it too, so the wheel is fully keyboard-operable —
// keyboard changes flow through onSelect and the effect scrolls the wheel to
// match, while a pointer scroll flags itself so the effect doesn't fight it.
function Wheel<T extends string | number>({
  ariaLabel,
  values,
  selected,
  format,
  onSelect,
}: {
  ariaLabel: string;
  values: readonly T[];
  selected: T;
  format: (v: T) => string;
  onSelect: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>();
  const fromScroll = useRef(false);
  const idx = Math.max(0, values.indexOf(selected));

  // Keep the column aligned to the selected value, except right after a pointer
  // scroll set it (the browser already snapped there — re-assigning would jump).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    el.scrollTop = idx * ITEM_H;
  }, [idx]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const next = Math.min(
        values.length - 1,
        Math.max(0, Math.round(el.scrollTop / ITEM_H))
      );
      if (values[next] !== selected) {
        fromScroll.current = true;
        onSelect(values[next]);
      }
    }, 120);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = e.key === "ArrowDown"
      ? Math.min(values.length - 1, idx + 1)
      : Math.max(0, idx - 1);
    if (next !== idx) onSelect(values[next]);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKey}
      className={cn(
        "no-scrollbar relative h-[200px] flex-1 snap-y snap-mandatory overflow-y-auto",
        "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
      )}
      style={{ paddingBlock: PAD_ITEMS * ITEM_H }}
    >
      {values.map((v, i) => {
        const active = i === idx;
        return (
          <div
            key={String(v)}
            role="option"
            aria-selected={active}
            className={cn(
              "flex snap-center items-center justify-center font-mono tabular-nums transition-colors",
              active ? "text-neutral-900" : "text-neutral-500",
              ariaLabel === "Meridiem" ? "text-[17px]" : "text-[22px]"
            )}
            style={{ height: ITEM_H }}
          >
            {format(v)}
          </div>
        );
      })}
    </div>
  );
}

// Bottom-sheet wheel picker for a single start/end time. The value applies live
// as the vendor scrolls (the underlying time button + preview update on every
// stop) — "Done" and the backdrop just dismiss; nothing is discarded. Portaled
// to body above the modal layer, Esc-dismissable, body scroll locked.
export function TimeWheelSheet({
  dayLabel,
  which,
  value,
  onChange,
  onClose,
}: {
  dayLabel: string;
  which: "open" | "close";
  value: string; // "HH:MM"
  onChange: (hm: string) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const { h12, min, mer } = parseTime(value);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  const set = (next: Partial<{ h12: number; min: number; mer: Meridiem }>) =>
    onChange(
      buildTime(next.h12 ?? h12, next.min ?? min, next.mer ?? mer)
    );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Set ${which === "open" ? "opening" : "closing"} time for ${dayLabel}`}
      className="fixed inset-0 z-modal flex items-end justify-center"
    >
      <button
        type="button"
        aria-label="Close time picker"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-neutral-900/30 backdrop-blur-[2px] animate-fade-in"
      />

      <div className="relative w-full max-w-[400px] rounded-t-3xl bg-card px-6 pb-6 pt-5 shadow-lift animate-sheet-up">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-mono text-[11px] tracking-wide text-neutral-700">
            {dayLabel} · {which === "open" ? "opens" : "closes"}
          </span>
          <span className="font-mono text-base font-medium text-rescued-600">
            {to12h(value)}
          </span>
        </div>

        <div className="relative flex gap-1">
          {/* Center selection band + top/bottom fade, behind the wheels. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-lg bg-neutral-100"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              WebkitMaskImage:
                "linear-gradient(transparent, #000 24%, #000 76%, transparent)",
              maskImage:
                "linear-gradient(transparent, #000 24%, #000 76%, transparent)",
              background: "transparent",
            }}
          />
          <Wheel
            ariaLabel="Hour"
            values={HOURS}
            selected={h12}
            format={(v) => String(v)}
            onSelect={(v) => set({ h12: v })}
          />
          <div className="grid h-[200px] w-2 place-items-center font-mono text-[22px] text-neutral-500">
            :
          </div>
          <Wheel
            ariaLabel="Minute"
            values={MINUTES}
            selected={min}
            format={(v) => String(v).padStart(2, "0")}
            onSelect={(v) => set({ min: v })}
          />
          <Wheel
            ariaLabel="Meridiem"
            values={MERIDIEMS}
            selected={mer}
            format={(v) => v}
            onSelect={(v) => set({ mer: v })}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className={cn(
            "mt-4 w-full rounded-xl bg-rescued-600 py-3.5 font-sans text-[15px] font-bold text-white",
            "transition-[filter] hover:brightness-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          )}
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}
