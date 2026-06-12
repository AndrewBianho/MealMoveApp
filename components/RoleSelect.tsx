"use client";

import { useState, useTransition } from "react";
import { Toast, useToast } from "./Toast";
import { setRole } from "@/app/actions";

type ManagedRole = "volunteer" | "drop_off_admin" | "org_admin";

const OPTIONS: { value: ManagedRole; label: string }[] = [
  { value: "volunteer", label: "Volunteer" },
  { value: "drop_off_admin", label: "Drop-off admin" },
  { value: "org_admin", label: "Org admin" },
];

export function RoleSelect({
  userId,
  current,
  isSelf,
}: {
  userId: string;
  current: ManagedRole;
  isSelf: boolean;
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
        disabled={isPending}
        className="rounded-md border border-neutral-200/60 bg-card px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {isSelf && o.value === current ? " (you)" : ""}
          </option>
        ))}
      </select>
      <Toast message={message} />
    </>
  );
}
