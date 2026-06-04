"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "./cn";
import type { Role } from "@prisma/client";

type Item = { href: string; label: string };

const FEED: Item = { href: "/", label: "Feed" };
const MAP: Item = { href: "/map", label: "Map" };
const PICKUPS: Item = { href: "/pickups", label: "My pickups" };
const RESTAURANT: Item = { href: "/restaurant", label: "Restaurant" };
const DROPOFF: Item = { href: "/dropoff", label: "Drop-off" };
const IMPACT: Item = { href: "/impact", label: "Impact" };
const MEMBERS: Item = { href: "/admin/users", label: "Members" };

const NAV_BY_ROLE: Record<Role, Item[]> = {
  volunteer: [FEED, MAP, PICKUPS, IMPACT],
  restaurant: [RESTAURANT, IMPACT],
  drop_off_admin: [DROPOFF, IMPACT],
  org_admin: [FEED, MAP, PICKUPS, RESTAURANT, DROPOFF, IMPACT, MEMBERS],
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLowerCase() ?? "")
    .join("");
}

export function NavBar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV_BY_ROLE[role] ?? [];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const roleLabel = role.replace(/_/g, " ");

  return (
    <>
      {/* Desktop: inline links */}
      <nav className="ml-2 hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-all",
              isActive(item.href)
                ? "bg-neutral-900 text-neutral-50 shadow-card"
                : "text-neutral-600 hover:bg-white hover:text-neutral-900 hover:shadow-card"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Desktop: user + sign out */}
      <div className="ml-auto hidden items-center gap-3 md:flex">
        <span className="font-mono text-xs uppercase tracking-wide text-neutral-600">
          {roleLabel}
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-clay-200 to-clay-400 font-mono text-xs font-medium text-white shadow-card">
          {initials(name)}
        </span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
        >
          Sign out
        </button>
      </div>

      {/* Mobile: hamburger toggle */}
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="ml-auto grid h-9 w-9 place-items-center rounded-md text-neutral-700 hover:bg-neutral-100 md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          {open ? (
            <path d="M6 6l12 12M6 18L18 6" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {/* Mobile: dropdown panel */}
      {open && (
        <div className="absolute left-0 right-0 top-16 z-20 border-b border-neutral-200/50 bg-neutral-50/95 shadow-card backdrop-blur-md md:hidden">
          <nav className="mx-auto flex max-w-5xl flex-col px-4 py-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm transition-colors",
                  isActive(item.href)
                    ? "bg-neutral-900 font-semibold text-neutral-50"
                    : "text-neutral-700 hover:bg-neutral-100"
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-neutral-200/40 px-3 pt-3">
              <span className="font-mono text-[11px] uppercase tracking-wide text-neutral-500">
                {name} · {roleLabel}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-sm font-medium text-neutral-700 hover:text-neutral-900"
              >
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
