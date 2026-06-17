import Link from "next/link";
import { MapPin } from "./icons";

export type HeroStat = { label: string; value: string | number };

/**
 * Shared header for the restaurant / drop-off detail pages: a soft white hero
 * card with a back link, a display-serif title, a mono address, an optional
 * status badge, and a sage metric-stat row — so the page leads with the facts
 * a volunteer scans, in the "Soft Harvest" voice.
 */
export function DetailHero({
  backHref,
  backLabel,
  eyebrow,
  title,
  address,
  badge,
  stats = [],
}: {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  address?: string | null;
  badge?: React.ReactNode;
  stats?: HeroStat[];
}) {
  return (
    <>
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full px-1 font-mono text-[11px] uppercase tracking-wide text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
      >
        <span aria-hidden>←</span> {backLabel}
      </Link>

      <div className="overflow-hidden rounded-3xl border border-neutral-200/50 bg-card shadow-card">
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                {eyebrow}
              </p>
              <h1 className="mt-1.5 font-display text-3xl font-semibold leading-tight text-neutral-900 text-balance">
                {title}
              </h1>
              {address && (
                <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-neutral-700">
                  <span className="text-neutral-600">
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  {address}
                </p>
              )}
            </div>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>

          {stats.length > 0 && (
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-neutral-200/50 pt-5">
              {stats.map((s) => (
                <div key={s.label}>
                  <dd className="font-display text-2xl font-semibold leading-none text-rescued-600">
                    {s.value}
                  </dd>
                  <dt className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                    {s.label}
                  </dt>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </>
  );
}
