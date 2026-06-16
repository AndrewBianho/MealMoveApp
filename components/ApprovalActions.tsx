"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { approveAccount, declineAccount } from "@/app/actions";

// Approve / decline buttons for one pending account in the org-admin queue.
// Approving materializes the partner's Restaurant/DropOff and activates the
// account; declining deletes the request. Both refresh the server view.
export function ApprovalActions({
  userId,
  demo = false,
}: {
  userId: string;
  demo?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  if (demo) {
    return (
      <span className="block text-right font-mono text-[11px] text-neutral-600">
        demo — approvals disabled
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-failed-600">{error}</span>}
      <Button
        variant="secondary"
        onClick={() => run(() => declineAccount(userId))}
        disabled={pending}
      >
        Decline
      </Button>
      <Button
        variant="primary"
        onClick={() => run(() => approveAccount(userId))}
        disabled={pending}
      >
        Approve
      </Button>
    </div>
  );
}
