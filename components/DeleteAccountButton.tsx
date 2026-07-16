"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { deleteAccount } from "@/app/actions";

// Soft-delete control for one active account in the org-admin roster. Two-step:
// "Remove" reveals a confirm so a single tap can't deactivate someone. The
// account keeps its history — only its login is removed. The server holds the
// real guards (self, last org admin, demo); we surface its error inline. Not
// rendered for the viewer's own row.
export function DeleteAccountButton({
  userId,
  demo = false,
}: {
  userId: string;
  demo?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccount(userId);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  if (demo) {
    return (
      <span className="block text-right font-mono text-[11px] text-neutral-700">
        Demo — disabled
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-failed-800">{error}</span>}
      {confirming ? (
        <>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-900 disabled:opacity-60"
          >
            Cancel
          </button>
          <Button
            variant="danger"
            onClick={onDelete}
            disabled={pending}
            className="px-4 py-1.5 text-sm"
          >
            {pending ? "Removing…" : "Confirm remove"}
          </Button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-failed-800 transition-colors hover:bg-failed-50 disabled:opacity-60"
        >
          Remove
        </button>
      )}
    </div>
  );
}
