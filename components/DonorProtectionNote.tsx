import { cn } from "./cn";

// TODO(legal): This is PLACEHOLDER copy only. Before relying on it, a human must
// confirm the actual good-faith donor-protection language and scope — e.g. the
// federal Bill Emerson Good Samaritan Food Donation Act and any Pennsylvania
// specifics. Do NOT present these as legal guarantees until reviewed. See
// IMPROVEMENTS.md Task 3 ("Out of scope for code").

// A reusable, non-scary reassurance for restaurants worried about liability when
// donating surplus. `variant="inline"` is a compact pointer (post form); `full`
// is the expanded note (privacy/help page).
export function DonorProtectionNote({
  variant = "full",
  className,
}: {
  variant?: "inline" | "full";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <p className={cn("text-[13px] text-neutral-700", className)}>
        Worried about liability?{" "}
        <a
          href="/privacy#donor-protection"
          className="font-semibold text-clay-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          How good-faith donors are protected
        </a>
      </p>
    );
  }

  return (
    <section
      id="donor-protection"
      className={cn("rounded-xl border border-neutral-200/60 bg-card p-5", className)}
    >
      <h2 className="text-lg font-semibold">Good-faith donor protection</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        {/* PLACEHOLDER — pending legal review (see TODO(legal) above). */}
        Restaurants and businesses that donate food in good faith are generally
        shielded from liability for harm that results, as long as the food was
        donated honestly and without gross negligence. Meal Move keeps a record of
        each donation and pickup to support that good-faith standard.
      </p>
      <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 font-mono text-[11px] text-neutral-700">
        Placeholder — pending legal review
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-neutral-700">
        This summary is informational only, not legal advice. The specific
        protections, and any conditions, will be confirmed and finalized here.
      </p>
    </section>
  );
}
