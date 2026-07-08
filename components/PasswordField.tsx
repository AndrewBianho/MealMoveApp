"use client";

import { useId, useState } from "react";
import { PASSWORD_RULES } from "@/lib/password";
import { cn } from "./cn";
import { inputCls, labelCls } from "./authStyles";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  autoComplete?: string;
  placeholder?: string;
  /** Show the live, non-punitive rule checklist (sign-up). Off for sign-in. */
  showRules?: boolean;
  /** Optional right-aligned slot on the label row, e.g. a "Forgot?" link. */
  labelRight?: React.ReactNode;
}

/**
 * Password input with an inline Show/Hide toggle and, when `showRules` is set, a
 * live rule checklist underneath. Each rule turns sage when met and stays calm
 * neutral when not (never tomato — unmet isn't a failure, just not-yet). Rules
 * come from lib/password.ts, so what's shown is exactly what the server
 * enforces. The checklist appears once the field is focused or has any value.
 */
export function PasswordField({
  value,
  onChange,
  id,
  label = "Password",
  autoComplete = "new-password",
  placeholder = "••••••••",
  showRules = true,
  labelRight,
}: PasswordFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [touched, setTouched] = useState(false);
  const [reveal, setReveal] = useState(false);
  const showChecklist = showRules && (touched || value.length > 0);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className={cn(labelCls, "mb-0")} htmlFor={inputId}>
          {label}
        </label>
        {labelRight}
      </div>
      <div className="relative">
        <input
          id={inputId}
          type={reveal ? "text" : "password"}
          autoComplete={autoComplete}
          className={cn(inputCls, "pr-16")}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setTouched(true)}
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          className={cn(
            "absolute inset-y-0 right-1 my-auto h-9 rounded px-2 font-mono text-[13px]",
            "text-rescued-600 hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          )}
          aria-pressed={reveal}
        >
          {reveal ? "Hide" : "Show"}
        </button>
      </div>
      {showChecklist && (
        <ul className="mt-2 space-y-1">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(value);
            return (
              <li
                key={rule.id}
                className="flex items-center gap-2 font-mono text-[13px]"
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    met ? "bg-rescued-600" : "bg-neutral-300"
                  )}
                  aria-hidden
                />
                <span className={met ? "text-rescued-600" : "text-neutral-700"}>
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
