"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { matchesRoute } from "@/lib/tour/route";
import { TourOverlay } from "./TourOverlay";

const KEY = "mm.tour";
const FIND_TIMEOUT_MS = 4000;

/**
 * Drives the demo tour: holds the step index, finds the current step's anchor,
 * and renders the overlay at it.
 *
 * Mirrors WelcomeIntro: mounted globally in the Header, opened by a window
 * event (`mm:open-tour`) so any button anywhere can start it, and portalled so
 * no parent's stacking context can trap it.
 *
 * The index persists, so a step that navigates survives the route change. The
 * provider renders nothing while the pathname disagrees with the step's route —
 * that is what lets a real click carry the viewer to the next step naturally.
 */
export function TourProvider({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => setMounted(true), []);

  // Resume an in-progress tour on mount.
  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== null) {
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 0 && n < TOUR_STEPS.length) setI(n);
      }
    } catch {
      /* private mode — just don't resume */
    }
  }, [enabled]);

  useEffect(() => {
    const open = () => setI(0);
    window.addEventListener("mm:open-tour", open);
    return () => window.removeEventListener("mm:open-tour", open);
  }, []);

  useEffect(() => {
    try {
      if (i === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(i));
    } catch {
      /* ignore */
    }
  }, [i]);

  const step = i === null ? null : TOUR_STEPS[i];
  const onRoute = step ? matchesRoute(step.route, pathname) : false;

  const advance = useCallback(() => {
    setI((n) => (n === null ? null : n + 1 >= TOUR_STEPS.length ? null : n + 1));
  }, []);

  const skip = useCallback(() => setI(null), []);

  // Find and measure the anchor. Retries briefly, because the element may still
  // be streaming in after a navigation; giving up hands the overlay a null rect,
  // which renders the docked card rather than nothing.
  //
  // Measure only on find, then on scroll and resize — NOT every frame. A rAF
  // loop that calls setRect continuously allocates a fresh DOMRect each frame
  // and re-renders the overlay forever, which is a real performance sink for a
  // component that sits on top of the whole app.
  useEffect(() => {
    if (!step || !onRoute) {
      setRect(null);
      return;
    }
    let findRaf = 0;
    let tickRaf = 0;
    let stop = false;
    let el: HTMLElement | null = null;
    const started = Date.now();

    const measure = () => {
      if (!stop && el) setRect(el.getBoundingClientRect());
    };

    // rAF-throttled: many scroll events collapse into one measurement.
    const onMove = () => {
      if (tickRaf) return;
      tickRaf = requestAnimationFrame(() => {
        tickRaf = 0;
        measure();
      });
    };

    // Prefer a visible match: the same data-tour anchor can exist in both the
    // desktop nav and the mobile bottom bar at once, and the hidden one
    // (display:none) still matches the selector but measures a zero-size rect.
    const findVisible = (): HTMLElement | null => {
      const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${step.anchor}"]`);
      for (const candidate of candidates) {
        const r = candidate.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return candidate;
      }
      return null;
    };

    const attempt = () => {
      if (stop) return;
      el = findVisible();
      if (el) {
        // "auto", not "smooth": smooth scrolling is silently ignored in some
        // environments (verified in the preview browser, with reduced-motion
        // OFF and scroll-behavior already auto), which left the spotlight and
        // its bubble stranded below the fold on any anchor past the first
        // screen. Instant also means the rect we measure on the next line is
        // final, instead of settling over the scroll and dragging the
        // spotlight a step behind.
        el.scrollIntoView({ block: "center", behavior: "auto" });
        measure();
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return;
      }
      if (Date.now() - started < FIND_TIMEOUT_MS) {
        findRaf = requestAnimationFrame(attempt);
      } else {
        setRect(null); // anchor never appeared — the overlay docks its card
      }
    };
    attempt();

    return () => {
      stop = true;
      cancelAnimationFrame(findRaf);
      cancelAnimationFrame(tickRaf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [step, onRoute, pathname]);

  // A click step advances when the viewer clicks the real element. Capture
  // phase, so it still fires when the target's own handler navigates away.
  useEffect(() => {
    if (!step || !onRoute || step.advance !== "click") return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[data-tour="${step.anchor}"]`)) advance();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, onRoute, advance]);

  useEffect(() => {
    if (i === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [i, skip]);

  if (!enabled || !mounted || !step || !onRoute) return null;

  return createPortal(
    <TourOverlay step={step} rect={rect} onNext={advance} onSkip={skip} />,
    document.body
  );
}
