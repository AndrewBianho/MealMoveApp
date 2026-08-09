// How long the stage-advanced banner holds before settling back into the
// stage's normal guidance. Long enough to read three short lines, short enough
// that it isn't still congratulating you halfway through the drive.
export const CELEBRATION_MS = 6500;

/**
 * The mini celebration: the photo landed, the rescue moved a stage, and this
 * says so in the volunteer's own terms — what they just completed, and the one
 * thing to do next. Sage, calm, and announced politely to screen readers, since
 * the advance is otherwise only visible as a dot ticking over in the stepper.
 *
 * Deliberately transient (see CELEBRATION_MS): it stands in for the stage's
 * normal panel for a few seconds, then hands back to it rather than stacking a
 * second copy of the same route guidance. Shared by the listing detail page and
 * the feed's inline advance panel so both moments read identically.
 */
export function StageAdvanced({
  step,
  detail,
  next,
}: {
  step: string;
  detail: string;
  next: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex animate-fade-up gap-2.5 rounded-xl bg-rescued-50 px-4 py-3"
    >
      <span
        aria-hidden
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rescued-600 text-white"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M5 13l4 4L19 7"
            className="[stroke-dasharray:20] motion-safe:animate-draw-check"
          />
        </svg>
      </span>
      <div>
        <p className="text-[16px] font-semibold text-rescued-800">
          {step} — nice one.
        </p>
        <p className="mt-0.5 text-[15px] leading-relaxed text-neutral-700">
          {detail} Next: {next}
        </p>
      </div>
    </div>
  );
}
