"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { releaseRescueForTour } from "@/app/actions";

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
    // Hand back the rescue a previous run left in flight. Without this the tour
    // reaches its claim step and finds no claim button at all — ListingDetail
    // shows "One rescue at a time" instead, because the viewer is still holding
    // the food the tour last told them to take. Best-effort: a failure here must
    // never leave the viewer pressing a dead button.
    try {
      await releaseRescueForTour();
    } catch {
      /* ignore — starting the tour matters more than a tidy world */
    }
    // ?tour=1 asks the feed not to bounce us to a rescue in flight. Belt and
    // braces with the release above: if that failed, this still reaches
    // chapter 1 rather than redirecting into the listing.
    router.push(`${TOUR_STEPS[0].route}?tour=1`);
    window.dispatchEvent(new Event("mm:open-tour"));
  }, [router]);
}
