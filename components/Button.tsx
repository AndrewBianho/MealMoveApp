import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-rescued-600 text-neutral-50 shadow-card hover:bg-rescued-800 hover:-translate-y-px",
  secondary:
    "border-2 border-neutral-900/15 bg-white text-neutral-900 hover:border-neutral-900/35 hover:-translate-y-px",
  danger:
    "border-2 border-failed-400 text-failed-600 hover:bg-failed-50 hover:-translate-y-px",
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
        "rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
        "active:translate-y-0 disabled:hover:translate-y-0",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
