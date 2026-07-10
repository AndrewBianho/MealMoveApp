"use client";

import { useState } from "react";
import { cn } from "./cn";
import { ChatPanel } from "./ChatPanel";

export interface DropOffThread {
  id: string;
  title: string;
  source: string;
  dropOff?: string;
  volunteerName?: string;
  status: string; // "claimed" | "in transit"
}

// Honey = claimed (waiting to set off), plum = in transit / taken home (the
// food is with the volunteer — on the way, or held overnight for tomorrow).
const STATUS_DOT: Record<string, string> = {
  claimed: "bg-urgent-600",
  "in transit": "bg-transit-600",
  "taken home": "bg-transit-600",
};

// A coordination inbox for a drop-off: every active delivery headed here is
// its own thread, and the admin can move between them without leaving the page.
// Reuses the per-claim ChatPanel (and its polling) for the open conversation.
export function DropOffChats({
  threads,
  viewerId,
}: {
  threads: DropOffThread[];
  viewerId: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null);

  if (threads.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-rescued-200/70 bg-gradient-to-b from-rescued-50/50 to-card px-6 py-10 text-center text-sm text-neutral-700">
        No active deliveries to coordinate right now. Conversations open here once
        a volunteer claims a pickup headed your way.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,19rem)_1fr]">
      <ul className="space-y-1.5">
        {threads.map((t) => {
          const active = t.id === activeId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                aria-pressed={active}
                className={cn(
                  "w-full rounded-2xl border px-3.5 py-2.5 text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
                  active
                    ? "border-neutral-900/10 bg-card shadow-card"
                    : "border-transparent hover:bg-card hover:shadow-card"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[t.status] ?? "bg-neutral-400")}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-semibold text-neutral-900">{t.title}</span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-neutral-700">
                  {t.source}
                  {t.volunteerName && <span> · {t.volunteerName}</span>}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-neutral-700">
                  {t.status}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-w-0">
        {activeId ? (
          // Re-mount per thread (key) so the panel resets its polling cleanly.
          <ChatPanel key={activeId} listingId={activeId} viewerId={viewerId} />
        ) : (
          <p className="text-sm text-neutral-700">Pick a conversation to open it.</p>
        )}
      </div>
    </div>
  );
}
