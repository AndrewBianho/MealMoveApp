import { RoleSelect } from "@/components/RoleSelect";
import { ApprovalActions } from "@/components/ApprovalActions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ManagedRole = "volunteer" | "drop_off_admin" | "org_admin";
const MANAGED: ManagedRole[] = ["volunteer", "drop_off_admin", "org_admin"];

function pendingOrgName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

export default async function AdminUsersPage() {
  const session = await auth();
  // Explicit select — phone is deliberately omitted so a volunteer's number is
  // never even fetched into admin-facing code (the sign-up promise, kept in code).
  const [users, pending] = await Promise.all([
    prisma.user.findMany({
      // Active accounts only — pending partners live in their own queue below.
      where: { status: "active" },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        restaurant: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, pendingOrg: true },
    }),
  ]);

  return (
    <main className="mx-auto max-w-[1760px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">Members</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Assign roles. Restaurant accounts are set at sign-up; the last org
          admin can&apos;t be removed.
        </p>
      </header>

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
          <div className="overflow-hidden rounded-xl border border-neutral-200/40 bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200/40 text-left">
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">Requested by</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">Email</th>
                  <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">Wants to add</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pending.map((u) => (
                  <tr key={u.id} className="border-b border-neutral-200/40 last:border-0">
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                        {u.role === "restaurant" ? "restaurant" : "drop-off"}
                      </span>
                      <span className="ml-2 text-neutral-800">{pendingOrgName(u.pendingOrg) ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ApprovalActions userId={u.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200/40 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200/40 text-left">
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                Name
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                Email
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === session?.user?.id;
              const managed = MANAGED.includes(u.role as ManagedRole);
              return (
                <tr key={u.id} className="border-b border-neutral-200/40 last:border-0">
                  <td className="px-4 py-3">
                    {u.name}
                    {isSelf && (
                      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wide text-neutral-700">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    {managed ? (
                      <RoleSelect
                        userId={u.id}
                        current={u.role as ManagedRole}
                        isSelf={isSelf}
                      />
                    ) : (
                      <span className="font-mono text-xs text-neutral-700">
                        restaurant · {u.restaurant?.name ?? "—"}
                      </span>
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
