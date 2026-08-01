"use client";

import { useEffect, useState } from "react";

/** Tailwind's `lg`. */
const QUERY = "(min-width: 1024px)";

/**
 * Starts false so the server render and the first client render agree; the
 * effect corrects it within a frame. Anything that must match on both passes
 * (the bottom-sheet fallback) is therefore the safe default.
 */
export function useIsWide(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return wide;
}
