"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { TOUR_STEPS } from "@/lib/tour/steps";

// Starts the demo tour. TourProvider is mounted globally in the Header and
// listens for `mm:open-tour`, so dispatching from anywhere opens it — the same
// arrangement NavBar's "Replay welcome" uses for the welcome carousel.
//
// Navigate first. This button only renders in Settings, and the provider draws
// nothing while the pathname disagrees with the current step's route. Dispatching
// from /settings therefore looked like a dead button — while still persisting
// step 0 to localStorage, so the tour would ambush the viewer the next time they
// opened the feed. WelcomeIntro avoids this by pushing its deck's home route
// before it dispatches; this does the same.
export function StartTourButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={() => {
        router.push(TOUR_STEPS[0].route);
        window.dispatchEvent(new Event("mm:open-tour"));
      }}
    >
      Take the tour
    </Button>
  );
}
