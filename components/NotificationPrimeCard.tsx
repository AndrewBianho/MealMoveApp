"use client";

import { useState } from "react";
import { Button } from "./Button";
import { requestPushToken } from "@/lib/firebaseClient";

// Shown once, right after a volunteer's claim, as a gentle on-ramp to pickup
// reminders — the design's anti-flaking lever. Calm, never urgent: it offers
// notifications and an equally easy "not now". Either choice marks the user as
// primed server-side so this never reappears.
export function NotificationPrimeCard({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    const token = await requestPushToken();
    await fetch("/api/notifications/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token ?? "" }),
    });
    setBusy(false);
    if (!token) {
      // Permission blocked or unsupported — the opt-in still flows to email.
      setNote("You'll get email reminders. Turn on push anytime in settings.");
      return;
    }
    onDone?.();
  }

  async function notNow() {
    setBusy(true);
    // Mark primed so the card stays dismissed; ignore failures (cosmetic only).
    await fetch("/api/notifications/prime", { method: "POST" }).catch(() => {});
    setBusy(false);
    onDone?.();
  }

  return (
    <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
      <p className="mb-2 font-mono text-[13px] text-neutral-700">
        Stay in the loop
      </p>
      <p className="font-display text-lg text-neutral-900">
        Want a nudge before pickup?
      </p>
      <p className="mt-1 text-[15px] text-neutral-700">
        We&apos;ll remind you when it&apos;s time to grab this food and head out — so
        it&apos;s one less thing to remember. You can turn this off anytime.
      </p>
      {note ? (
        <p className="mt-3 text-[15px] text-neutral-700">{note}</p>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={enable} disabled={busy}>
            {busy ? "…" : "Notify me about pickups"}
          </Button>
          <Button variant="ghost" onClick={notNow} disabled={busy}>
            Not now
          </Button>
        </div>
      )}
      {note && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => onDone?.()}>
            Got it
          </Button>
        </div>
      )}
    </div>
  );
}
