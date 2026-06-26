import Link from "next/link";

/**
 * The shared auth surface: a single centered card on the cream washes, hosting
 * sign in, forgot password, and the sign-up wizard. Every mode wears the same
 * brand header so the three screens read as one place. ~404px wide per the
 * redesign; `xl` radius (22px) keeps it on-token and softly rounded.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-start justify-center px-5 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-[404px] rounded-xl border border-neutral-200/70 bg-card p-8 shadow-card sm:p-9">
        <BrandHeader />
        {children}
      </div>
    </main>
  );
}

/** Logo mark + wordmark lockup, mirroring the app Header at card scale. */
function BrandHeader() {
  return (
    <Link href="/" className="mb-6 flex items-center gap-2.5">
      {/* CSS mask filled with theme ink, so the mark stays crisp in either
          theme with no surrounding square. Same source as Header.tsx. */}
      <span
        aria-hidden
        className="h-[30px] w-[30px] bg-neutral-900 [mask:url(/mealmovelogo.png)_center/contain_no-repeat] [-webkit-mask:url(/mealmovelogo.png)_center/contain_no-repeat]"
      />
      <span className="font-display text-[17px] font-semibold tracking-tight text-neutral-900">
        Meal Move
      </span>
    </Link>
  );
}
