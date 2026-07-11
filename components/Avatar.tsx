import Image from "next/image";
import { cn } from "./cn";

// Brand avatar — a warm clay gradient disc with lowercase display-serif
// initials (identity, not metadata, so display over mono; sentence-case per the
// design rules). When the account has a profile photo (`src`), it fills the disc
// instead. Shadowless by default; pass shadow-card where it should lift.
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

const PX = { sm: 32, lg: 56 } as const;

export function Avatar({
  name = "?",
  src,
  size = "sm",
  className,
}: {
  name?: string;
  src?: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-clay-200 to-clay-400 font-display font-semibold text-clay-800",
        SIZES[size],
        className
      )}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={PX[size]}
          height={PX[size]}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
