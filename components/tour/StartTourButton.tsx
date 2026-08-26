"use client";

import { Button } from "@/components/Button";
import { useStartTour } from "./useStartTour";

// Starts the demo tour from Settings. Rendered only for demo volunteers, since
// TourProvider is enabled on the same condition. See useStartTour for why the
// route push has to happen before the dispatch.
export function StartTourButton() {
  const startTour = useStartTour();
  return (
    <Button variant="secondary" onClick={startTour}>
      Take the tour
    </Button>
  );
}
