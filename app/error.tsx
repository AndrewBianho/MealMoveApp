"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";

// Page-level error boundary: catches render and server-action failures so a
// first-time volunteer meets a warm recovery instead of Next's bare default.
// The chip stays neutral (an app crash isn't time pressure — calm by default);
// `reset` retries the segment, and the digest ties the report to the server log.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-neutral-100 text-2xl text-neutral-700 shadow-card">
        <svg
          viewBox="0 0 24 24"
          width="1em"
          height="1em"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v4h4" />
        </svg>
      </div>
      <h1 className="mt-5 text-[34px] font-semibold leading-[1.1] tracking-tight text-balance">
        Something went sideways
      </h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-700">
        That&apos;s on us, not you. The food is still here. Give it another go,
        or head back to the rescues feed.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link
          href="/"
          className="inline-flex items-center rounded-2xl bg-card px-5 py-2.5 text-sm font-bold text-neutral-900 shadow-[inset_0_0_0_2px_rgb(var(--n-900)_/_0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_2px_rgb(var(--n-900)_/_0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
        >
          Back to rescues
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-[11px] uppercase tracking-wide text-neutral-500">
          ref {error.digest}
        </p>
      )}
    </main>
  );
}
