import type { ReactNode } from "react";

// The shared frame for the drop-off console's tab routes (About us /
// Conversations / Incoming / Impact). Each route reuses the same page shell
// and header so switching tabs keeps the location name fixed and only the
// body changes; the active tab is shown by the top NavBar pill.
export function DropOffTabShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-8">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-xl text-sm text-neutral-700">{subtitle}</p>
        )}
      </header>
      {children}
    </main>
  );
}

// A drop-off account whose location hasn't been linked yet (shouldn't happen
// after approval) gets a calm explanation instead of an empty console.
export function DropOffNotLinked() {
  return (
    <main className="mx-auto max-w-[720px] px-6 py-8">
      <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
        Drop-off
      </h1>
      <p className="mt-2 text-sm text-neutral-700">
        Your account isn&apos;t linked to a drop-off location yet. An org admin
        approves new drop-offs — reach out to your chapter&apos;s admin if this
        looks wrong.
      </p>
    </main>
  );
}
