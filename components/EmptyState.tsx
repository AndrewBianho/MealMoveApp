import { cn } from "./cn";

// A warm, branded empty state — an icon chip over a soft dashed panel, plus a
// title and an optional encouraging hint. Replaces bare "nothing here" text.
export function EmptyState({
  icon,
  title,
  hint,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-neutral-200 bg-card px-6 py-14 text-center shadow-card",
        className
      )}
    >
      {icon && (
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-neutral-100 text-neutral-500">
          {icon}
        </div>
      )}
      <p className="text-base font-medium text-neutral-800">{title}</p>
      {hint && (
        <p className="mx-auto mt-1.5 max-w-xs font-mono text-xs leading-relaxed text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  );
}
