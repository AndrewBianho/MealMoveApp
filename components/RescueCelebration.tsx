"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { CountUp } from "./CountUp";
import { ArrowRight } from "./icons";
import { cn } from "./cn";
import type { VolunteerImpact } from "@/lib/types";

// Decorative sage leaves drifting down behind the card — one calm pass, not a
// loop. Literal class strings so Tailwind's JIT sees every variant. Hidden
// entirely under prefers-reduced-motion (they're never needed to read state).
const LEAVES = [
  "left-[4%] h-3 w-2 bg-rescued-300 [animation-delay:0.1s] [animation-duration:5.6s]",
  "left-[12%] h-2 w-1.5 bg-rescued-200 [animation-delay:1.4s] [animation-duration:6.8s]",
  "left-[21%] h-3.5 w-2.5 bg-rescued-400 [animation-delay:0.6s] [animation-duration:5.1s]",
  "left-[30%] h-2.5 w-1.5 bg-rescued-200 [animation-delay:2.2s] [animation-duration:6.2s]",
  "left-[38%] h-3 w-2 bg-rescued-300 [animation-delay:0s] [animation-duration:7s]",
  "left-[47%] h-2 w-1.5 bg-rescued-400 [animation-delay:1.8s] [animation-duration:5.4s]",
  "left-[55%] h-3.5 w-2 bg-rescued-200 [animation-delay:0.9s] [animation-duration:6.5s]",
  "left-[63%] h-2.5 w-2 bg-rescued-300 [animation-delay:2.6s] [animation-duration:5.8s]",
  "left-[72%] h-3 w-1.5 bg-rescued-400 [animation-delay:0.3s] [animation-duration:6s]",
  "left-[80%] h-2 w-1.5 bg-rescued-200 [animation-delay:1.1s] [animation-duration:7.2s]",
  "left-[88%] h-3.5 w-2.5 bg-rescued-300 [animation-delay:1.9s] [animation-duration:5.3s]",
  "left-[95%] h-2.5 w-2 bg-rescued-400 [animation-delay:0.7s] [animation-duration:6.4s]",
];

function HarvestStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <CountUp
        value={value}
        className="font-display text-2xl font-semibold text-neutral-900"
      />
      <p className="mt-0.5 font-mono text-[13px] text-neutral-700">
        {label}
      </p>
    </div>
  );
}

/**
 * The payoff moment after a volunteer marks a rescue delivered: what they just
 * saved, the journey they closed, and their lifetime harvest. Celebration is
 * calm and warm (sage leaves, soft card) — never gamified or shouty.
 */
export function RescueCelebration({
  impact,
  servings,
  source,
  dropOff,
  onClose,
}: {
  impact: VolunteerImpact;
  servings: number;
  source: string;
  dropOff?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const firstRescue = impact.pickupsCompleted === 1;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rescue-celebration-title"
      className="fixed inset-0 z-modal grid place-items-center overflow-y-auto p-4"
    >
      <button
        type="button"
        aria-label="Close celebration"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {LEAVES.map((leaf, i) => (
          <span
            key={i}
            className={cn(
              "absolute -top-6 hidden rounded-full motion-safe:block animate-leaf-fall",
              leaf
            )}
          />
        ))}
      </div>

      <div className="relative w-full max-w-md rounded-3xl bg-card p-8 text-center shadow-lift animate-fade-up">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-rescued-50 px-3 py-1 font-mono text-[13px] text-rescued-800">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rescued-600" />
          rescue complete
        </p>

        <h2 id="rescue-celebration-title" className="mt-5">
          <CountUp
            value={`~${servings}`}
            className="block font-display text-6xl font-semibold leading-none text-rescued-600"
          />
          <span className="mt-2 block font-sans text-base text-neutral-700">
            servings rescued
          </span>
        </h2>

        <p className="mt-3 flex items-center justify-center gap-1.5 font-sans text-[15px] text-neutral-700">
          <span className="truncate">{source}</span>
          <span className="shrink-0 text-clay-600">
            <ArrowRight />
          </span>
          <span className="truncate">{dropOff ?? "drop-off"}</span>
        </p>

        <p className="mt-5 text-[16px] leading-relaxed text-neutral-700">
          {firstRescue
            ? "That was your first rescue — welcome to the crew. Food that was headed for the bin is on its way to plates instead."
            : "Food that was headed for the bin is on its way to plates instead. Thank you for showing up."}
        </p>

        <div className="mt-6 border-t border-neutral-200/60 pt-5">
          <p className="mb-3 font-mono text-[13px] text-neutral-700">
            Your harvest so far
          </p>
          <div className="grid grid-cols-3 gap-2">
            <HarvestStat
              value={String(impact.pickupsCompleted)}
              label={impact.pickupsCompleted === 1 ? "rescue" : "rescues"}
            />
            <HarvestStat value={String(impact.mealsRescued)} label="meals" />
            <HarvestStat value={`${impact.lbsSaved}`} label="lbs saved" />
          </div>
        </div>

        <div className="mt-7 space-y-2">
          <Button
            variant="primary"
            className="w-full"
            autoFocus
            onClick={() => router.push("/")}
          >
            Back to the feed
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Stay on this page
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
