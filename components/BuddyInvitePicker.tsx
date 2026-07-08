"use client";

import { useEffect, useState, useTransition } from "react";
import { getInvitableVolunteers, inviteBuddy } from "@/app/actions";
import { Avatar } from "./Avatar";

type Volunteer = { id: string; name: string };
type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; volunteers: Volunteer[] };

/**
 * Inline picker for choosing a volunteer to invite as a buddy. Loads the
 * invitable list lazily (only when opened), and covers every state: loading
 * (skeleton), error (retry), empty, and the list itself.
 */
export function BuddyInvitePicker({
  listingId,
  onInvited,
  onCancel,
}: {
  listingId: string;
  onInvited: (name: string) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    setState({ kind: "loading" });
    try {
      const volunteers = await getInvitableVolunteers(listingId);
      setState({ kind: "ready", volunteers });
    } catch {
      setState({ kind: "error" });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  function onPick(v: Volunteer) {
    setPendingId(v.id);
    startTransition(async () => {
      try {
        await inviteBuddy(listingId, v.id);
        onInvited(v.name);
      } catch {
        setPendingId(null);
        setState({ kind: "error" });
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[13px] text-neutral-700">
          Invite a buddy
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2 py-1 text-[15px] text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          Cancel
        </button>
      </div>

      {state.kind === "loading" && (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-11 rounded-2xl bg-neutral-100 motion-safe:animate-pulse"
            />
          ))}
        </ul>
      )}

      {state.kind === "error" && (
        <div className="rounded-2xl bg-failed-50 px-4 py-3 text-[16px] text-failed-800">
          <p>Couldn&apos;t load volunteers.</p>
          <button
            type="button"
            onClick={load}
            className="mt-1 font-medium text-failed-800 underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" && state.volunteers.length === 0 && (
        <p className="text-[16px] text-neutral-700">
          No volunteers to invite right now.
        </p>
      )}

      {state.kind === "ready" && state.volunteers.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {state.volunteers.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onPick(v)}
                disabled={isPending}
                aria-label={`Invite ${v.name} as a buddy`}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 text-left text-[16px] transition-colors hover:bg-rescued-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:opacity-50"
              >
                <span className="flex items-center gap-2.5">
                  <Avatar name={v.name} />
                  {v.name}
                </span>
                <span className="font-mono text-[13px] text-rescued-600">
                  {pendingId === v.id ? "inviting…" : "invite"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
