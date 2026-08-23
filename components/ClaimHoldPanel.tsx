"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "./icons";
import { cn } from "./cn";
import { DropOffName } from "./RetrievalHoursDisplay";
import type { RetrievalHours } from "@/lib/hours";

// The acknowledgment beat at the moment a volunteer commits — and the honest
// face of the 15-minute hold behind it.
//
// The hold is real: `runSweep` deletes any pickup whose `holdUntil` has passed
// with no pickup photo, returns the listing to the feed, cancels the buddy
// invites, and logs a `flaked` event against the volunteer's reliability. Until
// now none of that was visible; the only mention was a toast that vanished in
// under three seconds. A timer that silently costs someone reliability is the
// punitive version of this mechanic. Showing it — framed as *held for you*,
// never as a threat — is the non-punitive one (PRODUCT.md principle 1).
//
// Deliberately the quiet bookend to RescueCelebration: same journey line, same
// sage, but a panel rather than a modal. Claiming is a start, and the volunteer
// has somewhere to be.

// The check draws itself in on claim — the one "it worked" flourish here.
// stroke-dasharray is a literal 20 (roughly this path's length, and what the
// draw-check keyframe counts the offset down from); it can't be interpolated
// or Tailwind's JIT won't see the class.
function DrawnCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M5 13l4 4L19 7"
        className="[stroke-dasharray:20] motion-safe:animate-draw-check"
      />
    </svg>
  );
}

type Band = "calm" | "soon" | "close" | "lapsed";

// Banded to the hold's own 15-minute scale, not the listing card's expiry
// scale. Urgency cues stay reserved for real time pressure (PRODUCT.md
// principle 3) — most of the window sits calm in sage.
function bandOf(msLeft: number): Band {
  if (msLeft <= 0) return "lapsed";
  if (msLeft < 2 * 60_000) return "close";
  if (msLeft < 5 * 60_000) return "soon";
  return "calm";
}

// Ramp 800 for the readout (contrast against the sage panel), ramp 400 for the
// bar. The literal countdown is what names the urgency — colour only
// reinforces it, so the state survives without colour perception.
const BAND_TEXT: Record<Band, string> = {
  calm: "text-rescued-800",
  soon: "text-urgent-800",
  close: "text-failed-800",
  lapsed: "text-neutral-700",
};

const BAND_BAR: Record<Band, string> = {
  calm: "bg-rescued-400",
  soon: "bg-urgent-400",
  close: "bg-failed-400",
  lapsed: "bg-neutral-400",
};

// "12m 30s" / "45s" — seconds included because a 15-minute window formatted in
// whole minutes (lib/time's formatTimeLeft) would sit motionless for a minute
// at a time and read as broken.
function formatHold(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, "0")}s`;
}

export function ClaimHoldPanel({
  holdUntil,
  claimedAt,
  source,
  dropOff,
  dropOffHours,
  className,
}: {
  /** Epoch ms of the auto-release deadline (Listing.holdUntil). */
  holdUntil: number;
  /** Epoch ms of the claim, so the bar measures the real window. */
  claimedAt?: number;
  source: string;
  dropOff?: string | null;
  /** Drives the open/closed badge beside the destination. Omit when unknown. */
  dropOffHours?: RetrievalHours;
  className?: string;
}) {
  // Take the window from the claim itself rather than assuming 15 minutes, so
  // the bar stays truthful if the server's HOLD_MINUTES ever moves.
  const total =
    claimedAt && holdUntil > claimedAt ? holdUntil - claimedAt : 15 * 60_000;

  // 0 stands for "not mounted yet": the server render and the first client
  // render both show a full window, so a live clock can't desync hydration.
  // The effect corrects it on mount, within a frame.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const msLeft = now === 0 ? total : Math.max(0, holdUntil - now);
  const band = bandOf(msLeft);
  const lapsed = band === "lapsed";
  const pct = Math.min(100, Math.max(0, (msLeft / total) * 100));

  return (
    <div
      data-tour="claim-hold"
      className={cn("animate-fade-up rounded-xl bg-rescued-50 px-4 py-4", className)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rescued-600 text-white motion-safe:animate-scale-in"
        >
          <DrawnCheck />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-snug text-rescued-800">
            It&apos;s yours
          </p>
          {/* The same source → drop-off line the celebration closes with, so
              the two moments read as bookends on one journey. */}
          <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-neutral-700">
            <span className="truncate">{source}</span>
            <span aria-hidden className="shrink-0 text-clay-600">
              <ArrowRight />
            </span>
            <DropOffName
              name={<span className="truncate">{dropOff ?? "drop-off"}</span>}
              hours={dropOffHours}
            />
          </p>
        </div>
      </div>

      <div className="mt-3.5 border-t border-rescued-200/60 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[13px] text-neutral-700">
            {lapsed ? "Hold lapsed" : "Held for you"}
          </span>
          {/* role=timer is an implicitly-off live region: readable on demand,
              never announced every second. Once lapsed the label alone says
              it — a "0s" beside "Hold lapsed" is just noise. */}
          {!lapsed && (
            <span
              role="timer"
              aria-live="off"
              className={cn(
                "font-mono text-[13px] font-semibold tabular-nums",
                BAND_TEXT[band]
              )}
            >
              {formatHold(msLeft)}
            </span>
          )}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-rescued-200/60">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-1000 ease-linear",
              BAND_BAR[band]
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2.5 text-[15px] leading-relaxed text-neutral-700">
          {lapsed
            ? "This one may have gone back to the feed. If you're still on it, snap the photo anyway — that keeps it yours."
            : "Snap the pickup photo when you arrive. That locks it in."}
        </p>
      </div>
    </div>
  );
}
