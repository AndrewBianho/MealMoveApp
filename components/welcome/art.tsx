"use client";

import { useEffect, useState } from "react";
import { cn } from "../cn";
import { Clock, MapPin } from "../icons";
import { Avatar } from "../Avatar";
import { ReliabilityRing } from "../ReliabilityRing";

// Small bespoke vignettes for the welcome intro — one per feature. All motion is
// pure CSS/transition and reduced-motion safe: under prefers-reduced-motion each
// one lands on its final, legible state with no movement. Colors come from the
// ramp tokens (no one-off hex) so they re-skin with the theme.

export type ArtName =
  | "welcome"
  | "map"
  | "claim"
  | "reliability"
  | "themenav"
  | "team";

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(m.matches);
    on();
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

// Flips true one frame after mount so CSS transitions animate from their initial
// state. Reduced motion → true immediately (final state, no motion).
function useReveal() {
  const reduce = usePrefersReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reduce) {
      setOn(true);
      return;
    }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setOn(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [reduce]);
  return on;
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative grid h-44 place-items-center overflow-hidden rounded-2xl border border-neutral-200/60 bg-neutral-100/70",
        className
      )}
    >
      {children}
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

/* ── welcome hero ─────────────────────────────────────────────────────── */
function WelcomeHero() {
  const on = useReveal();
  return (
    <Panel className="bg-gradient-to-br from-rescued-50 to-clay-50">
      <div
        aria-hidden
        className={cn(
          "absolute h-28 w-28 rounded-full bg-rescued-200/50 blur-2xl transition-opacity duration-700",
          on ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "relative h-16 w-16 bg-neutral-900 transition-all duration-700 ease-out [mask:url(/mealmovelogo.png)_center/contain_no-repeat] [-webkit-mask:url(/mealmovelogo.png)_center/contain_no-repeat]",
          on ? "scale-100 opacity-100" : "scale-90 opacity-0"
        )}
      />
    </Panel>
  );
}

/* ── map route picker ─────────────────────────────────────────────────── */
function MapArt() {
  const on = useReveal();
  return (
    <Panel className="bg-neutral-100">
      <svg
        viewBox="0 0 240 160"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <g className="stroke-neutral-200/80" strokeWidth="1">
          <path d="M0 50 H240 M0 100 H240 M70 0 V160 M160 0 V160" />
        </g>
        {/* the chosen route, drawing in from current location to drop-off */}
        <path
          d="M40 120 C 80 112, 92 64, 130 60 S 184 48, 200 38"
          fill="none"
          className="stroke-route"
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          style={{
            strokeDashoffset: on ? 0 : 1,
            transition: "stroke-dashoffset 1100ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </svg>

      {/* "you are here" — pulsing dot at the route start (40,120) */}
      <span
        className="absolute"
        style={{ left: "16.7%", top: "75%", transform: "translate(-50%,-50%)" }}
      >
        <span className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-rescued-400/60 motion-safe:animate-ping" />
        <span className="relative block h-3 w-3 rounded-full border-2 border-card bg-rescued-600 shadow-card" />
      </span>

      {/* candidate drop-off, then the chosen one at the route end (200,38) */}
      <span
        className={cn(
          "absolute text-clay-600 transition-all duration-500",
          on ? "scale-100 opacity-60" : "scale-75 opacity-0"
        )}
        style={{ left: "54%", top: "37%", transform: "translate(-50%,-100%)", transitionDelay: "350ms" }}
      >
        <MapPin className="h-4 w-4" />
      </span>
      <span
        className={cn(
          "absolute text-clay-600 transition-all duration-500",
          on ? "scale-100 opacity-100" : "scale-75 opacity-0"
        )}
        style={{ left: "83.3%", top: "23.7%", transform: "translate(-50%,-100%)", transitionDelay: "750ms" }}
      >
        <MapPin className="h-5 w-5" />
      </span>

      {/* travel-time chip, like the route panel's Google Maps estimate */}
      <span
        className={cn(
          "absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 font-mono text-[10px] text-neutral-700 shadow-card transition-all duration-500",
          on ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
        )}
        style={{ transitionDelay: "950ms" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-route" />
        12 min
      </span>
    </Panel>
  );
}

/* ── claim & celebrate ────────────────────────────────────────────────── */
function ClaimArt() {
  const reduce = usePrefersReducedMotion();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (reduce) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => setDone(true), 1150);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <Panel className="bg-rescued-50/40">
      <div className="relative w-48 rounded-2xl bg-card p-3 shadow-card">
        {/* countdown chip: honey while open, sage once claimed */}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] transition-colors duration-500",
            done
              ? "bg-rescued-50 text-rescued-800"
              : "bg-urgent-50 text-urgent-800 motion-safe:animate-pulse"
          )}
        >
          {done ? (
            <>
              <Check className="h-3 w-3" />
              Rescued
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              8m left
            </>
          )}
        </span>
        <div className="mt-2.5 h-2.5 w-4/5 rounded-full bg-neutral-200" />
        <div className="mt-1.5 h-2 w-2/3 rounded-full bg-neutral-100" />
        <div className="mt-2.5 flex items-center gap-1.5 font-mono text-[9px] text-neutral-700">
          <span className="h-1.5 w-1.5 rounded-full bg-clay-400" />
          24 servings · 0.6 mi
        </div>

        {/* the payoff: a sage check stamps on when the rescue completes */}
        <span
          className={cn(
            "absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-rescued-600 text-card shadow-glow transition-all duration-500",
            done ? "scale-100 opacity-100" : "scale-50 opacity-0"
          )}
        >
          <Check className="h-4 w-4" />
        </span>
      </div>

      {/* a calm sprinkle of leaves on completion */}
      {[
        "left-[22%] [transition-delay:120ms]",
        "left-[50%] [transition-delay:260ms]",
        "left-[74%] [transition-delay:200ms]",
      ].map((pos, i) => (
        <span
          key={i}
          className={cn(
            "pointer-events-none absolute top-3 hidden h-2 w-1.5 rounded-full bg-rescued-300 transition-all duration-700 ease-out motion-safe:block",
            pos,
            done ? "translate-y-6 opacity-80" : "translate-y-0 opacity-0"
          )}
        />
      ))}
    </Panel>
  );
}

/* ── reliability ──────────────────────────────────────────────────────── */
function ReliabilityArt() {
  return (
    <Panel className="bg-neutral-100">
      {/* the real ring component — fills up on mount, non-punitive */}
      <ReliabilityRing pct={92} label="last 30 days" />
    </Panel>
  );
}

/* ── theme + mobile nav ───────────────────────────────────────────────── */
function ThemeNavArt() {
  const reduce = usePrefersReducedMotion();
  const [i, setI] = useState(0); // cycles theme segment + active tab
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((v) => (v + 1) % 3), 1600);
    return () => clearInterval(id);
  }, [reduce]);

  const tab = i % 2 === 0 ? 0 : 2; // active bottom tab slides between ends

  return (
    <Panel className="bg-neutral-100">
      <div className="flex h-36 w-[5.5rem] flex-col rounded-[1.4rem] border-2 border-neutral-300/70 bg-card p-1.5 shadow-card">
        {/* mini theme toggle — the active segment slides light → dark → system */}
        <div className="relative mt-0.5 flex h-4 rounded-full bg-neutral-100 p-0.5">
          <span
            className="absolute top-0.5 h-3 w-[30%] rounded-full bg-neutral-900 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${i * 100 + 4}%)` }}
          />
          {[0, 1, 2].map((s) => (
            <span key={s} className="z-10 flex-1" />
          ))}
        </div>

        <div className="mt-2 space-y-1.5 px-0.5">
          <div className="h-1.5 w-3/4 rounded-full bg-neutral-200" />
          <div className="h-1.5 w-full rounded-full bg-neutral-100" />
          <div className="h-1.5 w-2/3 rounded-full bg-neutral-100" />
        </div>

        {/* bottom tab bar with a sliding active pill */}
        <div className="relative mt-auto flex h-6 items-center justify-around rounded-full bg-neutral-100 px-1">
          <span
            className="absolute h-4 w-4 rounded-full bg-neutral-900 transition-all duration-300 ease-out"
            style={{ left: `calc(${tab * 33.3}% + 6px)` }}
          />
          {[0, 1, 2].map((t) => (
            <span
              key={t}
              className={cn(
                "relative z-10 h-1.5 w-1.5 rounded-full transition-colors",
                t === tab ? "bg-card" : "bg-neutral-300"
              )}
            />
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ── team invites ─────────────────────────────────────────────────────── */
function TeamArt() {
  const on = useReveal();
  const members = ["Ava Ortiz", "Ben Lee", "Mia Cruz"];
  return (
    <Panel className="bg-neutral-100">
      <div className="w-52 rounded-2xl bg-card p-3.5 shadow-card">
        <p className="mb-2.5 font-mono text-[10px] text-neutral-700">
          Your team
        </p>
        <div className="space-y-2">
          {members.map((m, idx) => (
            <div
              key={m}
              className={cn(
                "flex items-center gap-2 transition-all duration-500 ease-out",
                on ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"
              )}
              style={{ transitionDelay: `${idx * 130}ms` }}
            >
              <Avatar name={m} />
              <span className="h-2 w-20 rounded-full bg-neutral-200" />
            </div>
          ))}
          {/* the pending invite that just went out */}
          <div
            className={cn(
              "flex items-center gap-2 transition-all duration-500 ease-out",
              on ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"
            )}
            style={{ transitionDelay: "420ms" }}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-clay-400 text-clay-600">
              <span className="text-base leading-none">+</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-urgent-50 px-2 py-0.5 font-mono text-[9px] text-urgent-800">
              Invite sent
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function WelcomeArt({ name }: { name: ArtName }) {
  switch (name) {
    case "map":
      return <MapArt />;
    case "claim":
      return <ClaimArt />;
    case "reliability":
      return <ReliabilityArt />;
    case "themenav":
      return <ThemeNavArt />;
    case "team":
      return <TeamArt />;
    default:
      return <WelcomeHero />;
  }
}
