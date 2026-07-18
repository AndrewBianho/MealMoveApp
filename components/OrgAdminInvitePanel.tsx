"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOrgAdminInvite, revokeOrgAdminInvite } from "@/app/actions";
import { inputCls, labelCls, errorBannerCls } from "./authStyles";
import { cn } from "./cn";

type Org = { id: string; name: string };
type Invite = {
  id: string;
  email: string;
  orgName: string;
  status: string;
  createdAt: string; // preformatted date
};

// Super-admin-only: generate a one-time link that bootstraps an org_admin for a
// chosen (or newly created) organization, and manage outstanding invites. The
// raw link is shown once on creation — only its hash is stored server-side.
export function OrgAdminInvitePanel({
  orgs,
  invites,
  demo,
}: {
  orgs: Org[];
  invites: Invite[];
  demo: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(
    orgs.length > 0 ? "existing" : "new"
  );
  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDomain, setNewOrgDomain] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLink(null);
    setCopied(false);
    const res = await createOrgAdminInvite({
      email,
      orgId: mode === "existing" ? orgId : null,
      newOrgName: mode === "new" ? newOrgName : null,
      newOrgDomain: mode === "new" ? newOrgDomain : null,
    });
    setBusy(false);
    if (res.ok) {
      setLink(res.url);
      setEmail("");
      setNewOrgName("");
      setNewOrgDomain("");
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function revoke(id: string) {
    const res = await revokeOrgAdminInvite(id);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  const segBtn = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
      active
        ? "bg-neutral-900 text-neutral-50"
        : "text-neutral-700 hover:bg-neutral-100"
    );

  return (
    <section className="mb-8 rounded-2xl border border-neutral-200/60 bg-card p-5 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">Invite an org admin</h2>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-neutral-700">
        Generate a one-time link for someone to create an org-admin account. The
        link is shown once and never expires until it&apos;s used or revoked.
      </p>

      {demo && (
        <div className="mb-4 rounded-xl border border-transit-200/60 bg-transit-50 px-4 py-3 text-sm text-transit-800">
          You&apos;re exploring in demo mode. Generating and revoking invites is
          disabled here so the showcase can&apos;t create real accounts — switch
          to your real account to invite an org admin.
        </div>
      )}

      {error && (
        <p className={cn(errorBannerCls, "mb-4 text-sm")} role="alert">
          {error}
        </p>
      )}

      <form onSubmit={onGenerate} className="grid gap-4 sm:max-w-md">
        <div>
          <label htmlFor="invite-email" className={labelCls}>
            Their email (they can change it)
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@chapter.org"
            autoComplete="off"
            className={cn(inputCls, "text-sm")}
          />
        </div>

        <div>
          <span className={labelCls}>Organization</span>
          <div className="mb-2 inline-flex gap-1 rounded-full border border-neutral-200 p-1">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={segBtn(mode === "existing")}
              disabled={orgs.length === 0}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={segBtn(mode === "new")}
            >
              New org
            </button>
          </div>

          {mode === "existing" ? (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className={cn(inputCls, "text-sm")}
              aria-label="Existing organization"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="grid gap-2">
              <input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Organization name"
                aria-label="New organization name"
                className={cn(inputCls, "text-sm")}
              />
              <input
                value={newOrgDomain}
                onChange={(e) => setNewOrgDomain(e.target.value)}
                placeholder="Email domain (optional, e.g. chapter.org)"
                aria-label="New organization email domain"
                autoComplete="off"
                className={cn(inputCls, "text-sm")}
              />
            </div>
          )}
        </div>

        <div>
          <button
            type="submit"
            disabled={busy || demo}
            className={cn(
              "rounded-2xl px-5 py-2.5 text-sm font-bold text-neutral-50 transition-all disabled:opacity-50",
              "bg-gradient-to-b from-rescued-400 to-rescued-600 shadow-glow hover:-translate-y-0.5 hover:shadow-lift",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50"
            )}
          >
            {busy ? "Generating…" : "Generate link"}
          </button>
        </div>
      </form>

      {link && (
        <div className="mt-4 rounded-xl border border-rescued-200/60 bg-rescued-50 p-3.5 sm:max-w-md">
          <p className="mb-2 font-mono text-[11px] text-rescued-800">
            Copy this now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-card px-2.5 py-1.5 font-mono text-[12.5px] text-neutral-900"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-[13px] font-semibold text-neutral-50 hover:bg-neutral-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 font-mono text-[11px] text-neutral-700">Invites</h3>
          <ul className="overflow-hidden rounded-xl border border-neutral-200/60">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-200/40 px-3.5 py-2.5 text-sm first:border-t-0"
              >
                <span className="min-w-0 flex-1 truncate text-neutral-900">
                  {inv.email}
                </span>
                <span className="truncate text-neutral-700">{inv.orgName}</span>
                <span
                  className={cn(
                    "font-mono text-[11px]",
                    inv.status === "pending" && "text-urgent-800",
                    inv.status === "accepted" && "text-rescued-800",
                    inv.status === "revoked" && "text-neutral-700"
                  )}
                >
                  {inv.status}
                </span>
                <span className="font-mono text-[11px] text-neutral-700">
                  {inv.createdAt}
                </span>
                {inv.status === "pending" && !demo && (
                  <button
                    type="button"
                    onClick={() => revoke(inv.id)}
                    className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-failed-600 hover:bg-failed-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
