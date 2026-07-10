"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "./cn";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { NOTICE_KIND_LABEL, untilLabel } from "./DropOffNotices";
import { postDropOffNotice, removeDropOffNotice } from "@/app/actions";
import type { DropOffNoticeKind, DropOffNoticeView } from "@/lib/types";

const KINDS: DropOffNoticeKind[] = ["hours", "conditions", "general"];

// Drop-off tool: post a temporary change to this location's normal hours
// or conditions, and clear notices once they no longer apply. Volunteers see
// active notices wherever the drop-off appears.
export function DropOffNoticeManager({
  dropOffId,
  initial,
}: {
  dropOffId: string;
  initial: DropOffNoticeView[];
}) {
  const router = useRouter();
  const { message, show } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DropOffNoticeKind>("hours");
  const [body, setBody] = useState("");
  const [until, setUntil] = useState("");

  function post() {
    if (!body.trim()) {
      show("Add a short note about the change.");
      return;
    }
    startTransition(async () => {
      const res = await postDropOffNotice({
        dropOffId,
        kind,
        body,
        untilIso: until ? new Date(until).toISOString() : undefined,
      });
      if (res.ok) {
        setBody("");
        setUntil("");
        setOpen(false);
        show("Notice posted.");
        router.refresh();
      } else {
        show(res.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeDropOffNotice(id);
      if (res.ok) {
        show("Notice removed.");
        router.refresh();
      } else {
        show(res.error);
      }
    });
  }

  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400";

  return (
    <div className="mt-3 border-t border-neutral-200/40 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-neutral-700">
          Service notices
        </span>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="-my-2 -mx-1 inline-block rounded px-1 py-2 text-xs font-medium text-clay-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            Post a change
          </button>
        )}
      </div>

      {initial.length > 0 && (
        <ul className="mt-2 space-y-2">
          {initial.map((n) => (
            <li
              key={n.id}
              className="flex items-start justify-between gap-2 rounded-xl bg-urgent-50 px-3 py-2 text-urgent-800"
            >
              <div className="min-w-0">
                <div className="font-mono text-[10px] text-urgent-800/80">
                  {NOTICE_KIND_LABEL[n.kind]}
                  {n.until && <span> · until {untilLabel(n.until)}</span>}
                </div>
                <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug">{n.body}</p>
              </div>
              <button
                onClick={() => remove(n.id)}
                disabled={pending}
                aria-label="Remove notice"
                className="-mr-1 shrink-0 rounded-full px-2 py-0.5 text-urgent-800/70 transition-colors hover:bg-urgent-100 hover:text-urgent-800 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 space-y-2 rounded-xl border border-neutral-200/50 bg-neutral-50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[10px] transition-colors",
                  kind === k
                    ? "bg-neutral-900 text-neutral-50"
                    : "bg-card text-neutral-700 hover:text-neutral-900"
                )}
              >
                {NOTICE_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. Closing at 6 PM today for a building event — please arrive before then."
            className={fieldCls}
          />
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] text-neutral-700">
              clears after (optional)
            </span>
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className={fieldCls}
            />
          </label>
          <div className="flex gap-2">
            <Button variant="primary" onClick={post} disabled={pending}>
              {pending ? "Posting…" : "Post notice"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <Toast message={message} />
    </div>
  );
}
