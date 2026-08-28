"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { useStartTour } from "./useStartTour";

// Starts the demo tour from Settings. Rendered only when the viewer is a demo
// volunteer AND is carrying nothing — see lib/tour/gate.
//
// The pending label is not decoration: starting rebuilds the demo world first,
// which is seconds of server work. On a projector a button that looks dead for
// two seconds reads as a broken demo.
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
