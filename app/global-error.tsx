"use client";

import "./globals.css";

// Last-resort boundary: a failure in the root layout itself. It replaces the
// whole document, so it ships its own <html>/<body> and pulls in globals for the
// cream surface and tokens. The next/font variables aren't loaded here, so the
// display type falls back to Georgia by design (see tailwind.config fontFamily).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
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
          <h1 className="mt-5 font-display text-[34px] font-semibold leading-[1.1] tracking-tight">
            Something went sideways
          </h1>
          <p className="mt-2 max-w-sm text-sm text-neutral-700">
            Meal Move hit an unexpected error. Give it another go in a moment.
          </p>
          <button
            onClick={() => reset()}
            className="mt-6 inline-flex items-center rounded-2xl bg-gradient-to-b from-rescued-400 to-rescued-600 px-5 py-2.5 text-sm font-bold text-white shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
          >
            Try again
          </button>
          {error.digest && (
            <p className="mt-6 font-mono text-[11px] uppercase tracking-wide text-neutral-500">
              ref {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
