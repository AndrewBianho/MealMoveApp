"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { Clock } from "./icons";
import { activeMark, formatCountdown } from "@/lib/checkin-marks";
import { confirmCheckIn, releaseClaim } from "@/app/actions";

export function CheckInPrompt({
  listingId,
  claimedAt,
  holdUntil,
  lastCheckInAt,
}: {
  listingId: string;
  claimedAt: number;
  holdUntil: number;
  lastCheckInAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = holdUntil - now;
  const mark = activeMark(claimedAt, lastCheckInAt ?? null, now);

  function onConfirm() {
    startTransition(async () => {
      try {
        await confirmCheckIn(listingId);
        show("Thanks — still yours.");
      } catch {
        show("This pickup is no longer active.");
      }
    });
  }

  function onRelease() {
    startTransition(async () => {
      try {
        await releaseClaim(listingId);
        show("Released — back on the feed for someone else.");
      } catch {
        show("This pickup is no longer active.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
        Check-up
      </p>
      <p className="flex items-center gap-2 font-mono text-sm text-neutral-700">
        <span className="text-neutral-400">
          <Clock />
        </span>
        auto-releases in {formatCountdown(remaining)}
      </p>

      {mark !== null && (
        <div className="mt-4 rounded-md bg-urgent-50 px-4 py-3">
          <p className="text-sm font-medium text-urgent-800">
            Still picking this up?
          </p>
          <p className="mt-0.5 text-[13px] text-urgent-800/80">
            Confirm so we know you&apos;re on it — or release it for someone else.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={onConfirm}
              disabled={isPending}
            >
              Still on it
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={onRelease}
              disabled={isPending}
            >
              I can&apos;t make it
            </Button>
          </div>
        </div>
      )}

      <Toast message={message} />
    </div>
  );
}
