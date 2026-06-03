import { RoleSelect } from "@/components/RoleSelect";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ManagedRole = "volunteer" | "drop_off_admin" | "org_admin";
const MANAGED: ManagedRole[] = ["volunteer", "drop_off_admin", "org_admin"];

export default async function AdminUsersPage() {
  const session = await auth();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { restaurant: { select: { name: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[32px] font-medium leading-tight">Members</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Assign roles. Restaurant accounts are set at sign-up; the last org
          admin can&apos;t be removed.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-neutral-200/40 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200/40 text-left">
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                Name
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                Email
              </th>
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
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
                      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600">
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
                      <span className="font-mono text-xs text-neutral-600">
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
