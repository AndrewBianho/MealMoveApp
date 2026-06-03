"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function Nav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role] ?? [];

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
  );
}
