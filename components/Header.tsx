"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/pickups", label: "My pickups" },
  { href: "/restaurant", label: "Restaurant" },
  { href: "/impact", label: "Impact" },
  { href: "/styleguide", label: "Style guide" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200/40 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-rescued-600 font-mono text-sm text-white">
            m
          </span>
          <span className="text-sm font-medium">Meal Move</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-neutral-100 font-medium text-neutral-900"
                    : "text-neutral-600 hover:text-neutral-900"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-neutral-600">
            volunteer
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-100 font-mono text-xs text-neutral-600">
            yo
          </span>
        </div>
      </div>
    </header>
  );
}
