"use client";

import { useState, useTransition } from "react";
import { Toast, useToast } from "./Toast";
import { setRole } from "@/app/actions";

type ManagedRole = "volunteer" | "org_admin";

const OPTIONS: { value: ManagedRole; label: string }[] = [
  { value: "volunteer", label: "Volunteer" },
  { value: "org_admin", label: "Org admin" },
];

// The roster marks the viewer's own row with a "You" chip beside their name, so
// the options stay plain role names — no "(you)" suffix duplicating it.
export function RoleSelect({
  userId,
  current,
  demo = false,
}: {
  userId: string;
  current: ManagedRole;
  demo?: boolean;
}) {
  const [value, setValue] = useState<ManagedRole>(current);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ManagedRole;
    const prev = value;
    setValue(next); // optimistic
    startTransition(async () => {
      const res = await setRole(userId, next);
      if (!res.ok) {
        setValue(prev); // revert
        show(res.error);
      } else {
        show(`Role updated to ${next.replace(/_/g, " ")}.`);
      }
    });
  }

  return (
    <>
      <select
        value={value}
        onChange={onChange}
        disabled={isPending || demo}
        title={demo ? "Demo accounts can't change roles" : undefined}
        className="rounded-lg border border-neutral-200 bg-card px-2.5 py-1.5 text-sm text-neutral-800 transition-colors hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Toast message={message} />
    </>
  );
}
