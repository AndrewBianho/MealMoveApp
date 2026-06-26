import { cn } from "./cn";
import { Users } from "./icons";

// The restaurant-facing "no false hope" signal. Shows how many volunteers are
// active near a pickup so a restaurant knows the odds before it posts. Honest
// and calm: a healthy count reads sage (open/good); zero is a gentle nudge —
// never a scary, tomato error state. Color is paired with words and an icon, so
// it never reads by hue alone (color-blind-safe).

interface NearbyVolunteersProps {
  count: number;
  /** `panel` for the post form, `inline` for a compact line on a listing card. */
  variant?: "panel" | "inline";
  className?: string;
}

export function NearbyVolunteers({
  count,
  variant = "panel",
  className,
}: NearbyVolunteersProps) {
  const some = count > 0;
  const label = `${count} ${count === 1 ? "volunteer" : "volunteers"}`;

  if (variant === "inline") {
    return (
      <p
        className={cn(
          "flex items-center gap-1.5 font-sans text-[13px]",
          some ? "text-rescued-800" : "text-neutral-700",
          className
        )}
      >
        <Users className={some ? "text-rescued-600" : "text-neutral-500"} />
        {some ? (
          <span>
            <span className="font-mono font-semibold tabular-nums">{count}</span> active
            nearby
          </span>
        ) : (
          <span>none nearby yet — a longer window helps</span>
        )}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md px-3 py-2.5",
        some ? "bg-rescued-50 text-rescued-800" : "bg-neutral-100 text-neutral-800",
        className
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Users className={some ? "text-rescued-600" : "text-neutral-500"} />
        {some ? `${label} active nearby right now.` : "No volunteers nearby right now."}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-700">
        {some
          ? "Good chance someone claims this soon after you post."
          : "Posting a longer pickup window — or trying again a little later — gives more people a chance to claim it."}
      </p>
    </div>
  );
}
