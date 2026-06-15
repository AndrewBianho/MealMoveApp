import Link from "next/link";

// A soft, branded empty panel for a detail-page section (rounded-2xl dashed).
export function DetailEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-card/60 px-6 py-10 text-center text-sm text-neutral-700">
      {children}
    </div>
  );
}

// Full-page "not found" state for the restaurant / drop-off detail routes.
export function DetailNotFound({ label }: { label: string }) {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <div className="rounded-3xl border border-dashed border-neutral-200 bg-card px-6 py-16 text-center shadow-card">
        <p className="text-sm text-neutral-700">{label}</p>
        <Link
          href="/map"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-1 font-mono text-[11px] uppercase tracking-wide text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
        >
          <span aria-hidden>←</span> back to the map
        </Link>
      </div>
    </main>
  );
}
