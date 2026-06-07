import { cn } from "./cn";

// Brand avatar — a warm clay gradient disc with lowercase display-serif
// initials (identity, not metadata, so display over mono; sentence-case per the
// design rules). Shadowless by default; pass shadow-card where it should lift.
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLowerCase() ?? "")
    .join("");
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-14 w-14 text-base",
} as const;

export function Avatar({
  name = "?",
  size = "sm",
  className,
}: {
  name?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-clay-200 to-clay-400 font-display font-semibold text-clay-800",
        SIZES[size],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
