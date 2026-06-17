"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

// Non-punitive circular meter — a ring + percentage, color-keyed by the same
// thresholds as ReliabilityMeter (sage ≥80, honey 50–79, tomato <50). The ring
// and the number animate up on mount; reduced-motion lands on the final value.
function tierOf(pct: number) {
  if (pct >= 80) return "high" as const;
  if (pct >= 50) return "mid" as const;
  return "low" as const;
}

const STROKE = {
  high: "text-rescued-600",
  mid: "text-urgent-600",
  low: "text-failed-600",
} as const;

const SIZE = 132;
const STROKE_W = 10;
const R = (SIZE - STROKE_W) / 2;
const CIRC = 2 * Math.PI * R;

export function ReliabilityRing({ pct, label }: { pct: number; label?: string }) {
  const target = Math.max(0, Math.min(100, Math.round(pct)));
  const t = tierOf(target);
  const [shown, setShown] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return;
    }
    const ease = (x: number) => 1 - Math.pow(1 - x, 4);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1000);
      setShown(target * ease(p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setShown(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);

  const offset = CIRC * (1 - shown / 100);

  return (
    <div className="relative grid h-[132px] w-[132px] place-items-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE_W}
          className="stroke-neutral-200/70"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE_W}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          className={cn("stroke-current", STROKE[t])}
        />
      </svg>
      <div className="absolute text-center">
        <div
          className={cn(
            "font-display text-3xl font-semibold leading-none",
            STROKE[t]
          )}
        >
          {Math.round(shown)}%
        </div>
        {label && (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
