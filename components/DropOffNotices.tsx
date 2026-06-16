import { cn } from "./cn";
import type { DropOffNoticeKind, DropOffNoticeView } from "@/lib/types";

export const NOTICE_KIND_LABEL: Record<DropOffNoticeKind, string> = {
  hours: "hours change",
  conditions: "conditions change",
  general: "notice",
};

// "until <when>" — short for today, with a weekday once it's further out.
export function untilLabel(until: number): string {
  const d = new Date(until);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return d.toLocaleString([], {
    ...(sameDay ? {} : { weekday: "short" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

// Triangle "heads up" glyph — pairs with the kind label so the notice never
// relies on the amber hue alone (color-blind-safe).
function NoticeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

// Read-only list of a drop-off's active service notices. A calm amber "heads up"
// treatment (honey = attention), paired with an icon + the kind label so it
// reads without color. Renders nothing when there are no notices.
export function DropOffNotices({
  notices,
  className,
}: {
  notices: DropOffNoticeView[];
  className?: string;
}) {
  if (notices.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {notices.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-2.5 rounded-xl bg-urgent-50 px-3.5 py-2.5 text-urgent-800"
        >
          <span className="mt-0.5 shrink-0 text-urgent-600">
            <NoticeGlyph />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-wide text-urgent-800/80">
              <span className="font-semibold">{NOTICE_KIND_LABEL[n.kind]}</span>
              {n.until && <span>· until {untilLabel(n.until)}</span>}
            </div>
            <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug">{n.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
