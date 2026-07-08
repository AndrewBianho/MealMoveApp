// Shape-agnostic fallback for routes without their own skeleton (auth forms,
// settings, static pages): a calm sage spinner instead of placeholder boxes,
// so a light page never flashes a skeleton that mismatches its real layout.
// The motion is decorative — the global prefers-reduced-motion rule stills it,
// and the mono "loading" label plus the sr-only text carry the state without it.
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <svg
        viewBox="0 0 24 24"
        className="h-9 w-9 animate-spin text-rescued-600"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.4" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <p className="mt-4 font-mono text-xs text-neutral-700">Loading</p>
      <span className="sr-only">Loading…</span>
    </main>
  );
}
