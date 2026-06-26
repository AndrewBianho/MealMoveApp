"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "./cn";
import { primaryFill } from "./styles";
import { ArrowRight, X } from "./icons";
import { CheckIcon } from "./AuthPanels";
import type { OnboardingStep } from "@/lib/onboarding";

const DISMISS_KEY = "mm.firstRescueDismissed";

// The three milestones that move a volunteer's first meal. Mono labels (metadata
// convention) and a fixed order — position + label carry meaning so the disc
// states never read by color alone (color-blind safe).
const STEPS = [
  { label: "claim a pickup", verb: "Claimed" },
  { label: "pick it up", verb: "Picked up" },
  { label: "drop it off", verb: "Delivered" },
] as const;

// Contextual line + (optional) action for the current milestone.
function guidance(step: OnboardingStep, source?: string) {
  switch (step) {
    case 0:
      return {
        line: "Three steps to your first saved meal. Start by claiming an open pickup below.",
        cta: null,
      };
    case 1:
      return {
        line: source
          ? `You're holding ${source} for 15 minutes. Head over and grab the food.`
          : "You've claimed a pickup. Head over and grab the food.",
        cta: { label: "Go to your pickup" },
      };
    default:
      return {
        line: "You've got the food. Drop it at the drop-off to close your first rescue.",
        cta: { label: "Finish your delivery" },
      };
  }
}

/**
 * First-run activation tracker on the volunteer feed: a calm 3-step path to a
 * first completed rescue, driven by real claim → pickup → drop-off state from
 * `getVolunteerOnboarding`. Auto-retires once they finish their first rescue;
 * dismissible (respected via localStorage). Not gamified — no points or streaks,
 * just the next move made obvious for a first-timer in a hurry.
 */
export function FirstRescueTracker({
  step,
  active,
}: {
  step: OnboardingStep;
  active: { listingId: string; source: string } | null;
}) {
  // Visible by default (server-rendered, no pop-in for the common first-run
  // case); the effect only hides it if this person already dismissed it.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* private mode — just leave it showing */
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — fine, it stays dismissed for this session */
    }
  }

  if (dismissed) return null;

  const { line, cta } = guidance(step, active?.source);
  const pct = Math.round((step / STEPS.length) * 100);

  return (
    <section
      aria-labelledby="first-rescue-heading"
      className="relative mb-6 animate-fade-up overflow-hidden rounded-3xl bg-card p-5 shadow-card sm:p-6"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss first-rescue guide"
        className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
      >
        <X className="h-4 w-4" />
      </button>

      <span className="inline-flex items-center gap-1.5 rounded-full bg-rescued-50 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-rescued-800">
        <span className="h-1.5 w-1.5 rounded-full bg-rescued-600" aria-hidden />
        first rescue
      </span>

      <h2
        id="first-rescue-heading"
        className="mt-3 font-display text-2xl font-semibold tracking-tight text-neutral-900"
      >
        Your first rescue
      </h2>
      <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-neutral-700">
        {line}
      </p>

      {/* Stepper. An ordered list so it reads as a sequence to assistive tech;
          aria-current marks the live step. */}
      <ol className="mt-5 flex items-center" aria-label="First rescue progress">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          const last = i === STEPS.length - 1;
          return (
            <li
              key={s.label}
              className={cn("flex items-center", !last && "flex-1")}
              aria-current={current ? "step" : undefined}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs font-bold transition-colors",
                    done && "bg-rescued-600 text-white",
                    current &&
                      "bg-urgent-50 text-urgent-800 ring-2 ring-urgent-400 motion-safe:animate-pulse",
                    !done && !current && "bg-neutral-100 text-neutral-500"
                  )}
                >
                  {done ? <CheckIcon className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "max-w-[5.5rem] font-mono text-[11px] leading-tight sm:max-w-none",
                    done && "text-neutral-700",
                    current && "font-semibold text-neutral-900",
                    !done && !current && "text-neutral-500"
                  )}
                >
                  {done ? s.verb.toLowerCase() : s.label}
                </span>
              </div>
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1.5 -mt-6 h-0.5 flex-1 rounded-full transition-colors sm:mx-2",
                    i < step ? "bg-rescued-400" : "bg-neutral-200"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      <span className="sr-only" role="status">
        {step} of {STEPS.length} steps done, {pct}%.
      </span>

      {cta && active && (
        <Link
          href={`/listings/${active.listingId}`}
          className={cn(
            "mt-5 inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
            "hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 active:scale-[0.98]",
            primaryFill
          )}
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}
