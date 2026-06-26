import Link from "next/link";

/**
 * The shared success payoff, shown after a sign-in or a completed sign-up: a
 * sage disc with a check, a display-serif heading, one warm line, and a calm
 * way back. Sage = success; the check + label carry the meaning without relying
 * on hue. Scales in (motion-safe) rather than sliding, a quiet arrival.
 */
export function SuccessPanel({
  heading,
  message,
  children,
}: {
  heading: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="motion-safe:animate-scale-in text-center">
      <div
        aria-hidden
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rescued-100 text-rescued-600"
      >
        <CheckIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-4 font-display text-2xl font-semibold text-neutral-900">
        {heading}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-[15px] leading-relaxed text-neutral-700">
        {message}
      </p>
      {children}
    </div>
  );
}

/** "Back to sign in" — the recurring quiet escape hatch on the panels. */
export function BackToSignIn({ className }: { className?: string }) {
  return (
    <Link
      href="/login"
      className={
        "inline-block font-bold text-rescued-600 underline-offset-2 hover:underline " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 " +
        "focus-visible:ring-offset-2 rounded " +
        (className ?? "")
      }
    >
      Back to sign in
    </Link>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
