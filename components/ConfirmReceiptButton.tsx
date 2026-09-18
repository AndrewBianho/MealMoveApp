"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { confirmReceipt } from "@/app/actions";

/**
 * The drop-off's acknowledgement that food actually reached them.
 *
 * Until this existed a delivery was asserted only by the volunteer walking away
 * from it — the one party who knows for certain that it arrived had no way to
 * say so. It never contradicts the volunteer: confirming adds a record, it does
 * not change the rescue's status (see lib/handover).
 */
export function ConfirmReceiptButton({
  listingId,
  confirmed,
}: {
  listingId: string;
  /** Already acknowledged — by this location or an org admin. */
  confirmed: boolean;
}) {
  const [done, setDone] = useState(confirmed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="mt-2 font-mono text-[12px] text-rescued-800">
        Received · confirmed
      </p>
    );
  }

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full py-2 text-[14px]"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await confirmReceipt(listingId);
              setDone(true);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Couldn't confirm just now."
              );
            }
          })
        }
      >
        {pending ? "Confirming…" : "Confirm we received this"}
      </Button>
      {error && (
        <p className="mt-1.5 text-[13px] text-failed-800" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
