"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { updateDropOffNotes } from "@/app/actions";

// Lets a drop-off admin set the special requests / restraints for a location.
export function DropOffNotesEditor({
  dropOffId,
  initialNotes,
}: {
  dropOffId: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  function save() {
    startTransition(async () => {
      const res = await updateDropOffNotes(dropOffId, notes);
      if (res.ok) {
        setEditing(false);
        show("Special requests updated.");
      } else {
        show(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="mt-1">
        <p className="text-xs text-neutral-600">
          {notes || (
            <span className="italic text-neutral-500">No special requests set.</span>
          )}
        </p>
        <button
          onClick={() => setEditing(true)}
          className="mt-1 text-xs font-medium text-rescued-600 hover:underline"
        >
          Edit special requests
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. no nuts · drop at side entrance · before 7pm"
        className="w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
      />
      <div className="mt-2 flex gap-2">
        <Button variant="primary" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
      <Toast message={message} />
    </div>
  );
}
