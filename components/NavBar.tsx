"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Avatar } from "./Avatar";
import { cn } from "./cn";
import type { Role } from "@prisma/client";

type Item = { href: string; label: string; short?: string; icon: string };

const FEED: Item = { href: "/", label: "Rescues", icon: "feed" };
const MAP: Item = { href: "/map", label: "Map", icon: "map" };
const PICKUPS: Item = { href: "/pickups", label: "My pickups", short: "Pickups", icon: "pickups" };
const RESTAURANT: Item = { href: "/restaurant", label: "Restaurant", short: "Restaurant", icon: "restaurant" };
const DROPOFF: Item = { href: "/dropoff", label: "Drop-off", icon: "dropoff" };
const IMPACT: Item = { href: "/impact", label: "Impact", icon: "impact" };
const MEMBERS: Item = { href: "/admin/users", label: "Members", icon: "members" };

const NAV_BY_ROLE: Record<Role, Item[]> = {
  volunteer: [FEED, MAP, PICKUPS, IMPACT],
  restaurant: [RESTAURANT, IMPACT],
  drop_off_admin: [DROPOFF, IMPACT],
  org_admin: [FEED, MAP, PICKUPS, RESTAURANT, DROPOFF, IMPACT, MEMBERS],
};

// Line icons for the mobile bottom bar / more-sheet, keyed by Item.icon.
const ICONS: Record<string, React.ReactNode> = {
  feed: (
    <path d="M12 21s-7-4.4-9.4-8.6C1.2 9.1 2.8 5.5 6.2 5.5c1.9 0 3.1 1.1 3.8 2.1.7-1 1.9-2.1 3.8-2.1 3.4 0 5 3.6 3.6 6.9C19 16.6 12 21 12 21z" />
  ),
  map: (
    <>
      <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.3" />
    </>
  ),
  pickups: (
    <>
      <path d="M21 8 12 3 3 8l9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  restaurant: (
    <>
      <path d="M4 3v6a2 2 0 0 0 4 0V3" />
      <path d="M6 9v12" />
      <path d="M18 3c-1.7 0-3 2.2-3 5s1.1 4 3 4v9" />
    </>
  ),
  dropoff: (
    <>
      <path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
    </>
  ),
  impact: (
    <>
      <path d="M5 20V10" />
      <path d="M12 20V4" />
      <path d="M19 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.6 19.5a5.4 5.4 0 0 1 10.8 0" />
      <path d="M16.5 5.3a3.2 3.2 0 0 1 0 5.4" />
      <path d="M19.8 19.5a5.4 5.4 0 0 0-3-4.9" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" />
    </>
  ),
};

function TabIcon({ icon }: { icon: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[icon]}
    </svg>
  );
}

export function NavBar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Portal target only exists after mount; the bar/sheet are portaled to <body>.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const items = NAV_BY_ROLE[role] ?? [];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const roleLabel = role.replace(/_/g, " ");

  // Mobile bottom bar: show up to 4 primary tabs, then a "More" tab. Anything
  // past 4 (e.g. org_admin's longer list) moves into the more-sheet alongside
  // profile / settings / sign out.
  const MAX_TABS = 4;
  const primary = items.length > MAX_TABS ? items.slice(0, MAX_TABS) : items;
  const overflow = items.length > MAX_TABS ? items.slice(MAX_TABS) : [];
  const moreActive = open || isActive("/profile") || isActive("/settings");

  return (
    <>
      {/* Desktop: inline links */}
      <nav className="ml-2 hidden items-center gap-1 md:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition duration-150",
              isActive(item.href)
                ? "bg-neutral-900 text-neutral-50 shadow-card"
                : "text-neutral-600 hover:bg-card hover:text-neutral-900 hover:shadow-card"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Desktop: user + sign out */}
      <div className="ml-auto hidden items-center gap-2.5 md:flex">
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
          {roleLabel}
        </span>
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={isActive("/settings") ? "page" : undefined}
          className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition duration-150 hover:bg-card hover:text-neutral-900 hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
        <Link
          href="/profile"
          aria-label="Your profile"
          aria-current={isActive("/profile") ? "page" : undefined}
          className="rounded-full transition duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
        >
          <Avatar name={name} className="shadow-card" />
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-full px-3 py-1.5 text-sm font-semibold text-neutral-600 transition duration-150 hover:bg-card hover:text-neutral-900 hover:shadow-card"
        >
          Sign out
        </button>
      </div>

      {/* Mobile: fixed bottom tab bar + sheet, portaled to <body> so the header's
          backdrop-filter doesn't become their containing block (which would pin
          them to the header instead of the viewport). Hidden on md+. */}
      {mounted &&
        createPortal(
          <>
            <nav
              aria-label="Primary"
              className="fixed inset-x-0 bottom-0 z-sticky flex items-stretch border-t border-neutral-200/50 bg-neutral-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
            >
        {primary.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 py-1.5 focus:outline-none focus-visible:bg-card"
            >
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full transition-colors",
                  active ? "bg-neutral-900 text-neutral-50" : "text-neutral-500"
                )}
              >
                <TabIcon icon={item.icon} />
              </span>
              <span
                className={cn(
                  "text-[10px] leading-none",
                  active ? "font-semibold text-neutral-900" : "text-neutral-500"
                )}
              >
                {item.short ?? item.label}
              </span>
            </Link>
          );
        })}

        {/* "More" tab — avatar opens a sheet with overflow + account actions. */}
        <button
          type="button"
          aria-label="More"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 flex-col items-center gap-1 py-1.5 focus:outline-none focus-visible:bg-card"
        >
          <span
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full transition-shadow",
              moreActive && "ring-2 ring-neutral-900"
            )}
          >
            <Avatar name={name} />
          </span>
          <span
            className={cn(
              "text-[10px] leading-none",
              moreActive ? "font-semibold text-neutral-900" : "text-neutral-500"
            )}
          >
            More
          </span>
        </button>
      </nav>

      {/* Mobile: more-sheet (overflow nav + profile / settings / sign out). */}
      {open && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-modal animate-fade-in bg-neutral-900/40"
          />
          <div className="fixed inset-x-0 bottom-0 z-modal animate-fade-up rounded-t-3xl border-t border-neutral-200/50 bg-neutral-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lift">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
            <div className="mb-3 flex items-center gap-3 px-1">
              <Avatar name={name} size="lg" />
              <div className="min-w-0">
                <div className="truncate font-display text-base font-semibold text-neutral-900">
                  {name}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                  {roleLabel}
                </div>
              </div>
            </div>

            <div className="space-y-0.5">
              {[...overflow, { href: "/profile", label: "Profile", icon: "profile" }, { href: "/settings", label: "Settings", icon: "settings" }].map(
                (item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "bg-neutral-900 font-semibold text-neutral-50"
                          : "text-neutral-700 hover:bg-neutral-100"
                      )}
                    >
                      <span className={active ? "text-neutral-50" : "text-neutral-500"}>
                        <TabIcon icon={item.icon} />
                      </span>
                      {item.label}
                    </Link>
                  );
                }
              )}
            </div>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="mt-2 w-full rounded-xl border-t border-neutral-200/40 px-3 pt-3 text-left text-sm font-medium text-neutral-700 hover:text-neutral-900"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
          </>,
          document.body
        )}
    </>
  );
}
