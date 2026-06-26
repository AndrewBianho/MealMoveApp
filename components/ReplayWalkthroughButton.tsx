"use client";

import { Button } from "./Button";

// Replays the one-time welcome walkthrough (WelcomeIntro). That carousel is
// mounted globally in the Header and listens for the `mm:open-intro` window
// event, so dispatching it from anywhere reopens the role-tailored tour.
export function ReplayWalkthroughButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => window.dispatchEvent(new Event("mm:open-intro"))}
    >
      Replay walkthrough
    </Button>
  );
}
