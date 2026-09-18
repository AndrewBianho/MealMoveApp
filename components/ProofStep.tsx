"use client";

import { Button } from "./Button";
import { Camera } from "./icons";
import { ImageUploadField } from "./ImageUploadField";

/**
 * The photo-proof beat that advances a rescue — one component for all three
 * places it happens (pickup, delivery, and the delivery of a taken-home
 * rescue).
 *
 * Two things this fixes about the old inline field:
 *
 * 1. **It says what the photo is for, in a heading.** Previously the volunteer
 *    saw a field labelled "Pickup photo" with a Take-photo button, and the only
 *    statement that the photo *is* the confirmation lived in grey hint text
 *    below it. Someone looking for "the button that says I did it" didn't find
 *    one. The heading now leads with the requirement.
 * 2. **Taking the photo no longer commits.** The old field submitted the moment
 *    the upload resolved: no review, no undo, and the stage advanced under the
 *    volunteer. Now the shot is held, shown back, and a separate confirm button
 *    finishes the step — so the irreversible tap is a deliberate one.
 */
export function ProofStep({
  /** The step this photo completes — "Picked up" / "Delivered". */
  stepName,
  /** Heading: the requirement, stated plainly. */
  title,
  /** One line on what to photograph. */
  detail,
  /** Label on the commit button once a photo is held. */
  confirmLabel,
  /** Stable key so a shot taken offline survives until the connection returns. */
  uploadKey,
  photo,
  onPhoto,
  onConfirm,
  submitting = false,
}: {
  stepName: string;
  title: string;
  detail: string;
  confirmLabel: string;
  uploadKey: string;
  /** The uploaded-but-not-yet-committed photo, or null while none is held. */
  photo: string | null;
  onPhoto: (url: string | null) => void;
  onConfirm: () => void;
  submitting?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-card p-5 shadow-card">
      <p className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-700">
        <Camera className="text-[1.05em]" />
        Photo required
      </p>
      <h2 className="mt-1.5 font-display text-[23px] font-medium leading-[1.15] tracking-tight text-balance text-neutral-900">
        {title}
      </h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-700">
        {detail} It&apos;s what marks this{" "}
        <span className="font-semibold text-neutral-800">{stepName}</span> — the
        rescue doesn&apos;t move on without it.
      </p>

      <ImageUploadField
        label={`${stepName} photo`}
        labelHidden
        optional={false}
        hint={
          photo
            ? "Happy with it? Confirm below. Or remove it and take another."
            : "Take it now, or upload one you already have."
        }
        aspect="aspect-[4/3]"
        uploadKey={uploadKey}
        value={photo}
        onChange={onPhoto}
      />

      {/* The commit is its own tap, and only exists once there's something to
          commit — so the button can never be the thing a volunteer hunts for
          before they have a photo. */}
      {photo && (
        <Button
          type="button"
          variant="claim"
          className="mt-4 w-full animate-fade-in"
          onClick={onConfirm}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? "Saving…" : confirmLabel}
        </Button>
      )}
    </section>
  );
}
