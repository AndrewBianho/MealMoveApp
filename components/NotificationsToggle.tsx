"use client";

import { useState } from "react";
import { Button } from "./Button";
import { requestPushToken } from "@/lib/firebaseClient";

export function NotificationsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setBusy(true);
    setError(null);
    const token = await requestPushToken();
    if (!token) {
      setError(
        "We couldn't turn on push here — you may have blocked notifications, or this browser doesn't support them. You'll still get email reminders."
      );
      // Still record the opt-in so email reminders flow.
    }
    const res = await fetch("/api/notifications/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token ?? "" }),
    });
    setBusy(false);
    if (res.ok || token === null) setEnabled(true);
  }

  async function disable() {
    setBusy(true);
    setError(null);
    await fetch("/api/notifications/unregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);
    setEnabled(false);
  }

  return (
    <div>
      <Button
        variant={enabled ? "secondary" : "primary"}
        onClick={enabled ? disable : enable}
        disabled={busy}
      >
        {busy ? "…" : enabled ? "Turn off notifications" : "Notify me about pickups"}
      </Button>
      {error && <p className="mt-2 text-sm text-failed-600">{error}</p>}
      {enabled && !error && (
        <p className="mt-2 font-mono text-[11px] text-neutral-700">
          Notifications on
        </p>
      )}
    </div>
  );
}
