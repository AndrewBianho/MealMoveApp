import { cn } from "./cn";
import { Navigation } from "./icons";
import { googleMapsDirectionsUrl, type LatLng } from "@/lib/directions";

// "Open in Google Maps" — a secondary action that hands the rescue's route off
// to Google Maps for turn-by-turn (you → pickup → drop-off). A plain external
// link so it works on every surface (especially mobile, where there's no map).
// Renders nothing when there's nowhere to navigate. Mirrors Button's secondary
// recipe (inset ink border on card).
export function OpenInMapsButton({
  pickup,
  dropOff,
  className,
}: {
  pickup?: LatLng | null;
  dropOff?: LatLng | null;
  className?: string;
}) {
  const href = googleMapsDirectionsUrl({ pickup, dropOff });
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl bg-card px-4 py-2.5 text-[16px] font-bold text-neutral-900 transition-all duration-200",
        "shadow-[inset_0_0_0_2px_rgb(var(--n-900)_/_0.14)] hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_2px_rgb(var(--n-900)_/_0.3)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
        className
      )}
    >
      <Navigation className="text-[1.05em]" />
      Open in Google Maps
    </a>
  );
}
