import Link from "next/link";
import { RoleSelect } from "@/components/RoleSelect";
import { ApprovalActions } from "@/components/ApprovalActions";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDemo } from "@/lib/mode";

export const dynamic = "force-dynamic";

function pendingOrgName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

export default async function AdminUsersPage() {
  const session = await auth();
  // Demo org-admins are showcase-only: they can browse the roster but the
  // server blocks them from approving, declining, or changing real accounts, so
  // disable the controls and say why rather than let a click fail.
  const demo = await isDemo();
  // Scope the roster to the viewer's world — demo and real never mix. A demo
  // org-admin (or any account browsing demo) sees only the curated demo
  // accounts, never real people; a real admin sees only real accounts.
  // Explicit select — phone is deliberately omitted so a volunteer's number is
  // never even fetched into admin-facing code (the sign-up promise, kept in code).
  const [users, pending] = await Promise.all([
    prisma.user.findMany({
      // Active accounts only — pending partners live in their own queue below.
      where: { status: "active", demo },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        restaurant: { select: { name: true } },
        dropOff: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { status: "pending", demo },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, pendingOrg: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Members</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Manage org admins. Volunteer and partner accounts are set at sign-up;
          the last org admin can&apos;t be removed.
        </p>
      </header>

      {demo && (
        <div className="mb-6 rounded-xl border border-transit-200/60 bg-transit-50 px-4 py-3 text-sm text-transit-800">
          You&apos;re exploring in demo mode. Member management is disabled here
          so the showcase can&apos;t change real accounts — switch to your real
          account to approve partners or assign roles.
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-800">Pending approvals</h2>
            <span className="font-mono text-xs text-neutral-700">{pending.length}</span>
          </div>
          <p className="-mt-2 mb-3 text-sm text-neutral-700">
            New restaurants and drop-offs need your confirmation before they can
            sign in or go live on the map.
          </p>
          <div className="overflow-hidden rounded-xl border border-urgent-200/60 bg-card shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-urgent-200/50 bg-urgent-50/60 text-left">
                  <th className="px-4 py-3 font-mono text-[10px] text-urgent-800">Requested by</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-urgent-800">Email</th>
                  <th className="px-4 py-3 font-mono text-[10px] text-urgent-800">Wants to add</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id} className="border-b border-neutral-200/40 transition-colors last:border-0 hover:bg-urgent-50/40">
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] text-neutral-700">
                        {u.role === "restaurant" ? "restaurant" : "drop-off"}
                      </span>
                      <span className="ml-2 text-neutral-800">{pendingOrgName(u.pendingOrg) ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ApprovalActions userId={u.id} demo={demo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200/40 bg-card shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200/40 bg-neutral-100/60 text-left">
              <th className="px-4 py-3 font-mono text-[10px] text-neutral-700">
                Name
              </th>
              <th className="px-4 py-3 font-mono text-[10px] text-neutral-700">
                Email
              </th>
              <th className="px-4 py-3 font-mono text-[10px] text-neutral-700">
                Role
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === session?.user?.id;
              return (
                <tr key={u.id} className="group relative border-b border-neutral-200/40 transition-colors last:border-0 hover:bg-rescued-50/40">
                  <td className="px-4 py-3">
                    {/* Stretched link: the ::after covers the whole row so the
                        entire box is clickable. Interactive controls below sit
                        above it via relative z-10 and keep working. */}
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-semibold text-neutral-900 underline-offset-2 after:absolute after:inset-0 group-hover:text-clay-800 group-hover:underline"
                    >
                      {u.name}
                    </Link>
                    {isSelf && (
                      <span className="ml-1.5 font-mono text-[10px] text-neutral-700">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === "org_admin" ? (
                      <span className="relative z-10 inline-block">
                        <RoleSelect
                          userId={u.id}
                          current="org_admin"
                          isSelf={isSelf}
                          demo={demo}
                        />
                      </span>
                    ) : u.role === "volunteer" ? (
                      // Volunteers keep a fixed role — no dropdown to change it.
                      <span className="font-mono text-xs text-neutral-700">
                        volunteer
                      </span>
                    ) : u.role === "drop_off" ? (
                      <span className="font-mono text-xs text-neutral-700">
                        drop-off · {u.dropOff?.name ?? "—"}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-neutral-700">
                        restaurant · {u.restaurant?.name ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
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
        </table>
      </div>
    </main>
  );
}
