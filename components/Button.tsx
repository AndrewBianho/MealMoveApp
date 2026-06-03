import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-rescued-600 text-white hover:bg-rescued-800",
  secondary:
    "border border-neutral-200/60 text-neutral-900 hover:bg-neutral-50",
  danger: "border border-failed-400 text-failed-400 hover:bg-failed-50",
  ghost: "text-neutral-600 hover:text-neutral-900",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
        // focus ring only — no drop shadows anywhere in the system
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-400 focus-visible:ring-offset-2",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
