"use client";

import { useState } from "react";
import { PASSWORD_RULES } from "@/lib/password";
import { cn } from "./cn";

const fieldCls =
  "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm " +
  "placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-transit-400 focus-visible:ring-offset-1";
const labelCls =
  "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-600";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  autoComplete?: string;
}

/**
 * Password input with a live, non-punitive rule checklist underneath. Each rule
 * turns sage when met and stays calm neutral when not (never tomato — unmet
 * isn't a failure, just not-yet). Rules come from lib/password.ts, so what's
 * shown is exactly what the server enforces. The checklist appears once the
 * field is focused or has any value.
 */
export function PasswordField({
  value,
  onChange,
  id = "password",
  label = "Password",
  autoComplete = "new-password",
}: PasswordFieldProps) {
  const [touched, setTouched] = useState(false);
  const show = touched || value.length > 0;

  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        className={fieldCls}
        placeholder="••••••••"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setTouched(true)}
      />
      {show && (
        <ul className="mt-2 space-y-1">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(value);
            return (
              <li
                key={rule.id}
                className="flex items-center gap-2 font-mono text-[11px]"
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    met ? "bg-rescued-600" : "bg-neutral-300"
                  )}
                  aria-hidden
                />
                <span className={met ? "text-rescued-600" : "text-neutral-500"}>
                  {rule.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
