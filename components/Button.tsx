import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { primaryFill } from "./styles";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: cn(primaryFill, "hover:-translate-y-0.5 hover:shadow-lift"),
  secondary:
    "bg-white text-neutral-900 shadow-[inset_0_0_0_2px_rgba(51,52,44,0.12)] hover:shadow-[inset_0_0_0_2px_rgba(51,52,44,0.28)] hover:-translate-y-0.5",
  danger:
    "bg-white text-failed-600 shadow-[inset_0_0_0_2px_theme(colors.failed.200)] hover:bg-failed-50 hover:-translate-y-0.5",
  ghost: "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100",
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
        "rounded-2xl px-5 py-2.5 text-sm font-bold transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50",
        "active:translate-y-0 disabled:hover:translate-y-0",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
