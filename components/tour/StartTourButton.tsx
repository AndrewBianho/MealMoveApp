"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { useStartTour } from "./useStartTour";

// Starts the demo tour from Settings. Rendered only for demo volunteers, since
// TourProvider is enabled on the same condition.
//
// The pending label is not decoration: starting now releases the rescue a
// previous run left in flight before it navigates, so there is a real round trip
// between the click and anything moving. On a projector a button that looks
// dead for half a second reads as a broken demo.
export function StartTourButton() {
  const startTour = useStartTour();
  const [starting, setStarting] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={starting}
      onClick={() => {
        setStarting(true);
        void startTour().finally(() => setStarting(false));
      }}
    >
      {starting ? "Starting…" : "Take the tour"}
    </Button>
  );
}
