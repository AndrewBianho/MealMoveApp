import Link from "next/link";

// Calm neutral+clay cue at the top of the feed when the chapter posted updates
// the volunteer hasn't opened. Never a status hue (honey/tomato stay for real
// urgency); clay is the secondary attention accent. Hidden at zero.
export function UpdatesBanner({ unseen }: { unseen: number }) {
  if (unseen <= 0) return null;
  return (
    <Link
      href="/updates"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-clay-200 bg-clay-50 px-4 py-3 transition-colors hover:bg-clay-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 lg:max-w-2xl"
    >
      <span aria-hidden className="text-[18px]">📣</span>
      <span className="text-[16px] font-semibold text-neutral-900">
        {unseen} new update{unseen === 1 ? "" : "s"}
      </span>
      <span aria-hidden className="ml-auto font-mono text-[13px] text-clay-800">
        View →
      </span>
    </Link>
  );
}
