// A section header for detail pages: display-serif title with a mono count chip,
// so the eye gets the heading and the size of what's under it in one glance.
export function SectionHeading({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-4 flex items-baseline gap-2.5">
      <h2 className="font-display text-lg font-semibold text-neutral-900">
        {title}
      </h2>
      {count != null && (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] tabular-nums text-neutral-700">
          {count}
        </span>
      )}
    </div>
  );
}
