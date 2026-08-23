"use client";

import { Button } from "@/components/Button";

// Starts the demo tour. TourProvider is mounted globally in the Header and
// listens for `mm:open-tour`, so dispatching from anywhere opens it — the same
// arrangement ReplayWalkthroughButton uses for the welcome carousel.
export function StartTourButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => window.dispatchEvent(new Event("mm:open-tour"))}
    >
      Take the tour
    </Button>
  );
}
