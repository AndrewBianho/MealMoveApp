"use client";

import { Button } from "@/components/Button";
import { useStartTour } from "./useStartTour";

// Starts the demo tour from Settings. Rendered only when the viewer is a demo
// volunteer AND is not carrying a rescue — see lib/tour/gate for why the second
// half matters. See useStartTour for why the route push precedes the dispatch.
export function StartTourButton() {
  const startTour = useStartTour();
  return (
    <Button variant="secondary" onClick={startTour}>
      Take the tour
    </Button>
  );
}
