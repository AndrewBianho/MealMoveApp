import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { RoleSelect } from "@/components/RoleSelect";
import { ApprovalActions } from "@/components/ApprovalActions";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { Avatar } from "@/components/Avatar";
import { GlobalRosterControls } from "@/components/GlobalRosterControls";
import { auth } from "@/auth";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isDemo } from "@/lib/mode";
import { isSuperAdmin } from "@/lib/roles";
import { rosterWhere } from "@/lib/orgRoster";

export const dynamic = "force-dynamic";

function pendingOrgName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

// The roster is grouped by role rather than listed flat: an org admin's real
// questions are "who can administer this?" and "how many volunteers do we have?",
// and both are answered by a glance at a section count. Order is by standing in
// the org (who runs it → who moves food → who supplies it → who receives it),
// not alphabetical by enum value.
const GROUPS = [
  { role: "super_admin", label: "Master admins" },
  { role: "org_admin", label: "Org admins" },
  { role: "volunteer", label: "Volunteers" },
  { role: "restaurant", label: "Restaurants" },
  { role: "drop_off", label: "Drop-offs" },
] as const;

type RosterUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  imageUrl: string | null;
  restaurant: { name: string } | null;
  dropOff: { name: string } | null;
  organization: { name: string } | null;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; q?: string }>;
}) {
  const actorUser = await requireRole("org_admin", "super_admin");
  const session = await auth();
  // Demo org-admins are showcase-only: they can browse the roster but the
  // server blocks them from approving, declining, or changing real accounts, so
  // disable the controls and say why rather than let a click fail.
  const demo = await isDemo();
  // A super admin (master admin) sees every org's roster, plus an org filter
  // and email search; a regular org admin's view is unchanged below.
  const superAdmin = isSuperAdmin(actorUser.role);
  const { org: orgFilter, q } = await searchParams;
  // Scope the roster to the viewer's world — demo and real never mix. A demo
  // org-admin (or any account browsing demo) sees only the curated demo
  // accounts, never real people; a real admin sees only real accounts.
  // Organizations group volunteers only: this admin sees their own org's
  // volunteers/admins, but the partner pool (restaurant/drop_off) stays global.
  const actor = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { organizationId: true },
      })
    : null;
  const adminOrgId = actor?.organizationId ?? null;

  const rosterBase = superAdmin
    ? rosterWhere(null, demo, { global: true })
    : rosterWhere(adminOrgId, demo);

  // Super-admin-only filters, ANDed onto the base roster.
  const filters: Prisma.UserWhereInput[] = [];
  if (superAdmin && orgFilter) filters.push({ organizationId: orgFilter });
  if (superAdmin && q) {
    filters.push({ email: { contains: q, mode: "insensitive" } });
  }
  const rosterFilter: Prisma.UserWhereInput =
    filters.length > 0 ? { AND: [rosterBase, ...filters] } : rosterBase;

  // Explicit select — phone is deliberately omitted so a volunteer's number is
  // never even fetched into admin-facing code (the sign-up promise, kept in code).
  const [users, pending, orgs] = await Promise.all([
    prisma.user.findMany({
      // Active accounts only — pending partners live in their own queue below.
      // Managed roles scoped to this admin's org (or every org for a super
      // admin); partners global.
      where: rosterFilter,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        imageUrl: true,
        restaurant: { select: { name: true } },
        dropOff: { select: { name: true } },
        organization: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { status: "pending", demo },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, pendingOrg: true },
    }),
    // Org list for the filter dropdown — only a super admin needs it, so a
    // regular org admin's page load never pays for this query.
    superAdmin
      ? prisma.organization.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const groups = GROUPS.map((g) => ({
    ...g,
    members: users.filter((u) => u.role === g.role) as RosterUser[],
  })).filter((g) => g.members.length > 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
          Members
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Everyone in the chapter. Volunteers can be made org admins and back
          again; partner accounts are set at sign-up, and the last org admin
          can&apos;t be removed.
        </p>
      </header>

      {superAdmin && <GlobalRosterControls orgs={orgs} />}

      {demo && (
        <div className="mb-6 rounded-xl border border-transit-200/60 bg-transit-50 px-4 py-3 text-sm text-transit-800">
          You&apos;re exploring in demo mode. Member management is disabled here
          so the showcase can&apos;t change real accounts — switch to your real
          account to approve partners or assign roles.
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">
              Pending approvals
            </h2>
            <span className="font-mono text-[13px] text-urgent-800">
              {pending.length}
            </span>
          </div>
          <p className="mb-3 max-w-2xl text-sm text-neutral-700">
            New restaurants and drop-offs need your confirmation before they can
            sign in or go live on the map.
          </p>
          <ul className="overflow-hidden rounded-2xl border border-urgent-200/60 bg-card shadow-card">
            {pending.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-y-3 border-t border-urgent-200/40 px-4 py-4 first:border-t-0"
              >
                <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                  <Avatar name={u.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-neutral-900">
                      {u.name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-neutral-700">
                      {u.email}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 pl-11 sm:pl-4 md:w-72">
                  <p className="font-mono text-[11px] text-neutral-700">
                    Wants to add
                  </p>
                  <p className="truncate text-sm text-neutral-800">
                    {u.role === "restaurant" ? "Restaurant" : "Drop-off"}
                    {" · "}
                    {pendingOrgName(u.pendingOrg) ?? "—"}
                  </p>
                </div>
                <div className="ml-auto pl-4">
                  <ApprovalActions userId={u.id} demo={demo} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The roster is a table at `md+` (density is what an admin wants when
          scanning a roster) and stacks into rows on a phone — the display
          switch strips native table semantics, so the ARIA roles restore them. */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200/60 bg-card shadow-card">
        {/* `block` below md, a real table at md+ — the whole box must switch,
            not just the rows: a `display: table` box still sizes to its
            min-content width and would push the page into horizontal overflow
            on a phone. */}
        <table role="table" className="block w-full md:table">
          <thead
            role="rowgroup"
            className="hidden border-b border-neutral-200 md:table-header-group"
          >
            <tr role="row">
              <th
                role="columnheader"
                scope="col"
                className="px-4 py-2.5 text-left font-mono text-[11px] font-normal text-neutral-700"
              >
                Member
              </th>
              <th
                role="columnheader"
                scope="col"
                className="px-4 py-2.5 text-left font-mono text-[11px] font-normal text-neutral-700"
              >
                Role
              </th>
              <th role="columnheader" scope="col" className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          {groups.map((group) => (
            <tbody role="rowgroup" key={group.role} className="block md:table-row-group">
              <tr role="row" className="block md:table-row">
                <th
                  role="columnheader"
                  scope="colgroup"
                  colSpan={3}
                  className="block border-y border-neutral-200/60 bg-neutral-50 px-4 py-2 text-left md:table-cell"
                >
                  <span className="text-[13px] font-semibold text-neutral-800">
                    {group.label}
                  </span>
                  <span className="ml-2 font-mono text-[11px] font-normal text-neutral-700">
                    {group.members.length}
                  </span>
                </th>
              </tr>

              {group.members.map((u) => {
                const isSelf = u.id === session?.user?.id;
                const partnerName =
                  u.role === "restaurant"
                    ? u.restaurant?.name
                    : u.role === "drop_off"
                      ? u.dropOff?.name
                      : null;
                const managed = u.role === "org_admin" || u.role === "volunteer";

                return (
                  <tr
                    role="row"
                    key={u.id}
                    className="group relative flex flex-wrap items-center gap-y-3 border-t border-neutral-200/60 px-4 py-4 transition-colors first:border-t-0 hover:bg-neutral-50/80 md:table-row md:px-0 md:py-0"
                  >
                    <td
                      role="cell"
                      className="w-full min-w-0 md:table-cell md:w-auto md:px-4 md:py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={u.name} src={u.imageUrl} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {/* Stretched link: the ::after covers the whole row
                                so the entire box is clickable. Interactive
                                controls sit above it via relative z-10. */}
                            <Link
                              href={`/admin/users/${u.id}`}
                              className="truncate text-[15px] font-semibold text-neutral-900 underline-offset-2 after:absolute after:inset-0 group-hover:text-clay-800 group-hover:underline"
                            >
                              {u.name}
                            </Link>
                            {isSelf && (
                              <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700">
                                You
                              </span>
                            )}
                          </div>
                          <p className="truncate font-mono text-[11px] text-neutral-700">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td
                      role="cell"
                      className="min-w-0 pl-11 md:table-cell md:px-4 md:py-3 md:pl-4"
                    >
                      {managed ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="relative z-10 inline-block">
                            <RoleSelect
                              userId={u.id}
                              current={u.role as "volunteer" | "org_admin"}
                              demo={demo}
                            />
                          </span>
                          {superAdmin && (
                            <span className="font-mono text-[13px] text-neutral-700">
                              {u.organization?.name ?? "—"}
                            </span>
                          )}
                        </div>
                      ) : u.role === "super_admin" ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono text-[11px] text-neutral-700">
                            Master admin
                          </span>
                          {superAdmin && (
                            <span className="font-mono text-[13px] text-neutral-700">
                              {u.organization?.name ?? "—"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          <span className="font-mono text-[11px] text-neutral-700">
                            {u.role === "restaurant" ? "Restaurant" : "Drop-off"}
                          </span>
                          <p className="truncate text-sm text-neutral-800">
                            {partnerName ?? "—"}
                          </p>
                        </>
                      )}
                    </td>

                    <td
                      role="cell"
                      className="ml-auto pl-4 md:table-cell md:px-4 md:py-3 md:text-right"
                    >
                      {!isSelf && (
                        <div className="relative z-10">
                          <DeleteAccountButton userId={u.id} demo={demo} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </main>
  );
}
