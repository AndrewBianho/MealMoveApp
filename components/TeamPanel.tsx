"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { Avatar } from "./Avatar";
import { Toast, useToast } from "./Toast";
import { inviteTeammate, cancelTeammateInvite } from "@/app/actions";

// Roster + email-invite manager for an organization. Restaurant members manage
// their own restaurant's team; drop-off admins manage the (chapter-wide) set of
// drop-off admins. New invitees join the same org when they sign up.
export function TeamPanel({
  members,
  invites,
  title = "Team",
  description,
}: {
  members: { id: string; name: string; email: string }[];
  invites: { id: string; email: string }[];
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const { message, show } = useToast();
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await inviteTeammate(value);
      if (res.ok) {
        setEmail("");
        show("Invite sent.");
        router.refresh();
      } else {
        show(res.error);
      }
    });
  }

  function onCancel(id: string) {
    startTransition(async () => {
      const res = await cancelTeammateInvite(id);
      if (res.ok) {
        show("Invite cancelled.");
        router.refresh();
      } else {
        show(res.error);
      }
    });
  }

  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm " +
    "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";

  return (
    <div className="rounded-xl border border-neutral-200/40 bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-700">
        {title} · {members.length}
      </p>
      {description && (
        <p className="mt-1 text-[13px] text-neutral-700">{description}</p>
      )}

      <ul className="mb-4 mt-3 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Avatar name={m.name} />
            <span className="min-w-0">
              <span className="block truncate text-sm text-neutral-900">
                {m.name}
              </span>
              <span className="block truncate font-mono text-[11px] text-neutral-700">
                {m.email}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <form onSubmit={onInvite} className="flex gap-2">
        <input
          type="email"
          autoComplete="off"
          className={fieldCls}
          placeholder="teammate@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={isPending || !email.trim()}
        >
          {isPending ? "…" : "Invite"}
        </Button>
      </form>

      {invites.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
            Pending
          </p>
          <ul className="space-y-1">
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 font-mono text-[12px] text-neutral-700"
              >
                <span className="truncate">{i.email}</span>
                <button
                  type="button"
                  onClick={() => onCancel(i.id)}
                  disabled={isPending}
                  className="-my-1.5 shrink-0 py-1.5 text-clay-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:opacity-50"
                >
                  cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Toast message={message} />
    </div>
  );
}
