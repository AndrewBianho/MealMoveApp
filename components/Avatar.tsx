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

export function Avatar({
  name = "?",
  className,
}: {
  name?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-clay-200 to-clay-400 font-display text-xs font-semibold text-clay-800",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
