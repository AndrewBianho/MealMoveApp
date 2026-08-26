"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { matchesRoute } from "@/lib/tour/route";
import { TourOverlay } from "./TourOverlay";

const KEY = "mm.tour";
const FIND_TIMEOUT_MS = 4000;
// After the fast rAF hunt gives up we keep looking, just slowly. A tour resumed
// from storage lands on a cold page whose feed may still be streaming, and an
// anchor that shows up late must still get its spotlight — otherwise the tour
// sits on its fallback card forever with the real target visible behind it.
const SLOW_RETRY_MS = 500;
// How long the route must hold still before a requested start commits to a step.
// A debounce, not a guess: router.push updates the URL optimistically, so the
// pathname can read as the destination for a moment and change again when the
// server responds.
const START_SETTLE_MS = 500;

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
  const [starting, setStarting] = useState(false);

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
    const open = () => {
      setI(null);
      setStarting(true);
    };
    window.addEventListener("mm:open-tour", open);
    return () => window.removeEventListener("mm:open-tour", open);
  }, []);

  // Resolve a requested start against the page the viewer actually lands on.
  //
  // useStartTour pushes step 0's route, but arriving there is not guaranteed:
  // a volunteer holding a live rescue is redirected off the feed to their
  // listing (app/(feed)/page.tsx), and the tour's own claim step is what puts
  // them in that state. Insisting on step 0 there renders nothing at all, while
  // still persisting a step that ambushes them later — so start at the first
  // step matching wherever we ended up instead. The tour is route-aware by
  // design; beginning at the chapter that describes the screen in front of you
  // is coherent, and it is always visible.
  useEffect(() => {
    if (!starting) return;
    // Never resolve on the first pathname seen. router.push sets the URL before
    // the server answers, so it reads as step 0's route for a moment even when
    // the app is about to redirect elsewhere — committing there locked the tour
    // to a step it was immediately navigated away from, and it rendered
    // nothing. The timer restarts on every pathname change, so this waits for
    // the route to stop moving.
    const settle = window.setTimeout(() => {
      const landed = matchesRoute(TOUR_STEPS[0].route, pathname)
        ? 0
        : TOUR_STEPS.findIndex((s) => matchesRoute(s.route, pathname));
      // Nowhere the tour recognises — the navigation hasn't landed yet (Settings
      // hosts no step). Keep waiting rather than committing to a fallback; the
      // effect re-runs on the next pathname change.
      if (landed === -1) return;
      setI(landed);
      setStarting(false);
    }, START_SETTLE_MS);
    return () => window.clearTimeout(settle);
  }, [starting, pathname]);

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
    let slowTimer = 0;
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

    // A resize can push the anchor off-screen — rotating a phone, or the
    // keyboard opening over a short viewport. Re-centre rather than just
    // re-measuring, or the spotlight faithfully tracks something the viewer
    // can no longer see.
    const onResize = () => {
      if (stop || !el) return;
      el.scrollIntoView({ block: "center", behavior: "auto" });
      measure();
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

    // Lock onto an anchor: centre it, measure it, and start tracking it.
    const attach = (found: HTMLElement) => {
      el = found;
      // "auto", not "smooth": smooth scrolling is silently ignored in some
      // environments (verified in the preview browser, with reduced-motion OFF
      // and scroll-behavior already auto), which left the spotlight and its
      // bubble stranded below the fold on any anchor past the first screen.
      // Instant also means the rect we measure next is final, instead of
      // settling over the scroll and dragging the spotlight a step behind.
      found.scrollIntoView({ block: "center", behavior: "auto" });
      measure();
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onResize);
    };

    const attempt = () => {
      if (stop) return;
      const found = findVisible();
      if (found) {
        attach(found);
        return;
      }
      if (Date.now() - started < FIND_TIMEOUT_MS) {
        findRaf = requestAnimationFrame(attempt);
        return;
      }
      // Dock the card so the viewer is never stuck without a way forward, but
      // keep watching on a slow timer rather than giving up for good.
      setRect(null);
      if (!slowTimer) {
        slowTimer = window.setInterval(() => {
          if (stop) return;
          const late = findVisible();
          if (!late) return;
          window.clearInterval(slowTimer);
          slowTimer = 0;
          attach(late);
        }, SLOW_RETRY_MS);
      }
    };
    attempt();

    return () => {
      stop = true;
      cancelAnimationFrame(findRaf);
      cancelAnimationFrame(tickRaf);
      if (slowTimer) window.clearInterval(slowTimer);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onResize);
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
