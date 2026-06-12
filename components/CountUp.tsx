"use client";

import { useEffect, useRef, useState } from "react";

// Animates the numeric part of a value string up from zero on mount, preserving
// any prefix/suffix (e.g. "1,240 lbs" or "$3.2k"). Reduced-motion shows the
// final value immediately.
export function CountUp({
  value,
  className,
  durationMs = 900,
}: {
  value: string;
  className?: string;
  durationMs?: number;
}) {
  const parts = value.match(/^(\D*)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  const [display, setDisplay] = useState(parts ? `${parts[1]}0${parts[3]}` : value);
  const raf = useRef(0);

  useEffect(() => {
    if (!parts) {
      setDisplay(value);
      return;
    }
    const [, prefix, numStr, suffix] = parts;
    const target = Number(numStr.replace(/,/g, ""));
    const hadComma = numStr.includes(",");
    const decimals = numStr.includes(".") ? numStr.split(".")[1].length : 0;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(target)) {
      setDisplay(value);
      return;
    }

    const ease = (t: number) => 1 - Math.pow(1 - t, 4); // ease-out-quart
    const start = performance.now();
    const fmt = (n: number) => {
      const fixed = n.toFixed(decimals);
      const body = hadComma
        ? Number(fixed).toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : fixed;
      return `${prefix}${body}${suffix}`;
    };
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setDisplay(fmt(target * ease(p)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={className} aria-label={value}>
      {display}
    </span>
  );
}
