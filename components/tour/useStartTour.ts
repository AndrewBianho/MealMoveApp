"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { resetDemoForTour } from "@/app/actions";

/**
 * Starts the demo tour from anywhere. TourProvider is mounted globally in the
 * Header and listens for `mm:open-tour`.
 *
 * Navigate first. The provider draws nothing while the pathname disagrees with
 * the current step's route, so dispatching from a page the tour doesn't open on
 * looks like a dead button — while still persisting step 0 to localStorage,
 * which makes the tour ambush the viewer the next time they land on the feed.
 * Every caller needs this, which is why it lives here rather than in one button.
 *
 * Callers must also gate themselves on demo + volunteer, matching TourProvider's
 * `enabled`: dispatching to a disabled provider is the same dead button by
 * another route.
 */
export function useStartTour() {
  const router = useRouter();
  return useCallback(async () => {
    // Rebuild the demo world first. Only four of its listings are claimable, and
    // every previous run consumed one, so without this the tour eventually opens
    // on an empty feed with no card to click. Best-effort: a failure here should
    // still leave the viewer with a tour, even a thin one.
    try {
      await resetDemoForTour();
    } catch {
      /* ignore — a stale world still demos better than a dead button */
    }
    router.push(TOUR_STEPS[0].route);
    window.dispatchEvent(new Event("mm:open-tour"));
  }, [router]);
}
