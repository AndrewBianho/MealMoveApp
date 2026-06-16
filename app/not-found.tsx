import Link from "next/link";
import { MapPin } from "@/components/icons";

// Friendly 404: a wandering pin, a warm line, and one clear way back to the
// food. The mono "error 404" code carries the technical signal without shouting.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-rescued-100 text-2xl text-rescued-800 shadow-card">
        <MapPin />
      </div>
      <h1 className="mt-5 text-[34px] font-semibold leading-[1.1] tracking-tight text-balance">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-700">
        The link may be old, or the rescue already wrapped up. Let&apos;s get you
        back to the food.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-rescued-400 to-rescued-600 px-5 py-2.5 text-sm font-bold text-white shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
      >
        Back to rescues
      </Link>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-wide text-neutral-500">
        error 404
      </p>
    </main>
  );
}
