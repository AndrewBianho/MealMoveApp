"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Master-admin-only roster controls: filter the global roster by organization
// and search by email. Both push URL search params so the server re-queries.
export function GlobalRosterControls({
  orgs,
}: {
  orgs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/admin/users?${next.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <span className="font-mono text-[13px]">org</span>
        <select
          value={params.get("org") ?? ""}
          onChange={(e) => setParam("org", e.target.value)}
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
      <input
        type="search"
        defaultValue={params.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value.trim())}
        placeholder="Search by email"
        aria-label="Search members by email"
        className="min-w-[220px] flex-1 rounded-full border-2 border-neutral-200 bg-card px-4 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
      />
    </div>
  );
}
