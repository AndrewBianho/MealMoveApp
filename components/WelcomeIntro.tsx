"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { Button } from "./Button";
import { cn } from "./cn";
import { ArrowRight, X } from "./icons";
import { WelcomeArt } from "./welcome/art";
import { SLIDES_BY_ROLE, type Tone } from "./welcome/slides";

const SEEN_KEY = "mm.introSeen";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// Each status chip pairs a ramp color with its label so meaning never rides on
// hue alone (color-blind safe). `route` has no 50/800 stops, so it borrows a
// neutral chip with a route-blue dot.
const TONES: Record<Tone, { chip: string; dot: string }> = {
  rescued: { chip: "bg-rescued-50 text-rescued-800", dot: "bg-rescued-600" },
  urgent: { chip: "bg-urgent-50 text-urgent-800", dot: "bg-urgent-600" },
  transit: { chip: "bg-transit-50 text-transit-800", dot: "bg-transit-600" },
  clay: { chip: "bg-clay-50 text-clay-800", dot: "bg-clay-600" },
  route: { chip: "bg-neutral-100 text-neutral-700", dot: "bg-route" },
};

/**
 * One-time welcome carousel for new users: a calm, role-tailored walk through
 * the features that move food. Auto-opens once on a new account's first visit
 * (localStorage flag + account-age gate), and can be replayed via the
 * `mm:open-intro` window event. Mirrors RescueCelebration's portal + dismissal.
 */
export function WelcomeIntro({
  role,
  name,
  createdAt,
}: {
  role: Role;
  name: string;
  createdAt: number;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  // The element focused when the tour opened, so dismissal can hand focus back
  // (e.g. the "Replay welcome" nav item) instead of dropping it to <body>.
  const openerRef = useRef<HTMLElement | null>(null);

  const deck = SLIDES_BY_ROLE[role] ?? SLIDES_BY_ROLE.volunteer;
  const slides = deck.slides;
  const last = slides.length - 1;
  const slide = slides[Math.min(step, last)];
  const firstName = (name || "").trim().split(/\s+/)[0] || "friend";

  useEffect(() => setMounted(true), []);

  // Auto-open once, and only for genuinely new accounts so a deploy never pops
  // the intro for established users.
  useEffect(() => {
    if (!mounted) return;
    try {
      const seen = localStorage.getItem(SEEN_KEY);
      const isNew = createdAt > 0 && Date.now() - createdAt < SEVEN_DAYS;
      if (!seen && isNew) setOpen(true);
    } catch {
      /* private mode / storage disabled — just don't auto-open */
    }
  }, [mounted, createdAt]);

  // Replay entry point (e.g. the "Replay welcome" nav item).
  useEffect(() => {
    const onOpen = () => {
      setStep(0);
      setDir(1);
      setOpen(true);
    };
    window.addEventListener("mm:open-intro", onOpen);
    return () => window.removeEventListener("mm:open-intro", onOpen);
  }, []);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "true");
    } catch {
      /* ignore */
    }
  }, []);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
    // Return focus to whatever launched the tour once it's gone.
    requestAnimationFrame(() => openerRef.current?.focus());
  }, [markSeen]);

  const finish = useCallback(() => {
    markSeen();
    setOpen(false);
    router.push(deck.home);
  }, [markSeen, router, deck.home]);

  const next = useCallback(() => {
    setDir(1);
    setStep((s) => (s >= last ? s : s + 1));
  }, [last]);

  const prev = useCallback(() => {
    setDir(-1);
    setStep((s) => (s <= 0 ? s : s - 1));
  }, []);

  // Keyboard: Esc closes, arrows navigate. Lock body scroll while open, and
  // remember the opener so close() can restore focus to it.
  useEffect(() => {
    if (!open) return;
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, next, prev]);

  if (!mounted || !open) return null;

  const onLast = step === last;
  const tone = TONES[slide.tone];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-intro-title"
      className="fixed inset-0 z-modal grid place-items-center overflow-y-auto p-4"
    >
      {/* Decorative click-to-dismiss scrim. It's not the labelled close control
          — its hit area spans the whole viewport but its centre sits under the
          card, so "activating" it there does nothing. The skip pill below is the
          real, always-hittable Close. */}
      <div
        aria-hidden
        onClick={close}
        className="absolute inset-0 cursor-default bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
      />

      <div className="relative w-full max-w-md rounded-3xl bg-card p-6 shadow-lift animate-fade-up sm:p-7">
        {/* progress dots + skip */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-hidden>
            {slides.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step ? "w-5 bg-neutral-900" : "w-1.5 bg-neutral-300"
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close the welcome tour"
            className="-my-1 inline-flex items-center gap-1 rounded-full px-2.5 py-2 font-mono text-[11px] text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            skip
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* the slide — re-keyed so its art and entrance replay on every step */}
        <div
          key={step}
          className={cn(
            "mt-4 motion-reduce:animate-fade-in",
            dir === 1
              ? "motion-safe:animate-slide-in-right"
              : "motion-safe:animate-slide-in-left"
          )}
        >
          <WelcomeArt name={slide.art} />

          <p
            className={cn(
              "mt-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px]",
              tone.chip
            )}
          >
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
            {slide.statusCode}
          </p>

          <h2
            id="welcome-intro-title"
            className="mt-3 font-display text-2xl font-semibold leading-tight text-neutral-900 text-balance"
          >
            {slide.title.replace("{name}", firstName)}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            {slide.body}
          </p>
        </div>

        {/* footer nav */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={prev}
            className={cn(step === 0 && "invisible")}
            aria-hidden={step === 0}
            tabIndex={step === 0 ? -1 : undefined}
          >
            Back
          </Button>

          {onLast ? (
            <Button variant="primary" autoFocus onClick={finish}>
              {deck.cta}
            </Button>
          ) : (
            <Button
              variant="primary"
              autoFocus
              onClick={next}
              className="inline-flex items-center gap-1.5"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
