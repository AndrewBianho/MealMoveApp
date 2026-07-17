"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Master-admin-only: scope the org-partitioned analytics sections to one org.
// Global food metrics are unaffected. Carries `?org=` alongside `?days=`.
export function OrgStatsSwitcher({
  orgs,
}: {
  orgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setOrg(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("org", value);
    else next.delete("org");
    router.push(`/admin/analytics?${next.toString()}`);
  }

  return (
    <label className="mb-6 flex items-center gap-2 text-sm text-neutral-700">
      <span className="font-mono text-[13px]">org</span>
      <select
        value={params.get("org") ?? ""}
        onChange={(e) => setOrg(e.target.value)}
        className="rounded-full border-2 border-neutral-200 bg-card px-4 py-1.5 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
      >
        <option value="">All orgs</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
