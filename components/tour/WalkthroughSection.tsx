import { getDataMode } from "@/lib/mode";
import { hasRescueInFlight } from "@/lib/tour/gate";
import { StartTourButton } from "./StartTourButton";

/**
 * The tour's entry point, with its gate and — when the gate is closed — the
 * reason why.
 *
 * Settings is the only caller today, but the gate is a rule about the tour
 * rather than about that page, so it lives here: a second hand-rolled copy is
 * how another surface would end up offering a tour that cannot run. Renders
 * nothing at all for anyone who isn't a demo volunteer, so a caller can drop it
 * in unconditionally.
 *
 * getDataMode is request-cached, so asking again here costs a page that already
 * called it nothing.
 */
export async function WalkthroughSection({
  userId,
  role,
}: {
  userId: string;
  role: string;
}) {
  const mode = await getDataMode();
  if (mode !== "demo" || role !== "volunteer") return null;
  const holdsRescue = await hasRescueInFlight(userId);

  return (
    <section className="mt-6 rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
      <h2 className="text-lg font-medium">Walkthrough</h2>
      {holdsRescue ? (
        <p className="mt-2 text-[15px] text-neutral-700">
          The tour starts by claiming a pickup, and you can only carry one rescue
          at a time. Deliver or release the one you&apos;re on to take the tour
          again.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <StartTourButton />
        </div>
      )}
    </section>
  );
}
