import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

// One-time bearer links a super_admin generates to bootstrap an org_admin. Only
// the sha256 of the raw token is ever stored (see OrgAdminInvite), so the raw
// token — carried solely in the link — can't be replayed from a database leak.

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

type OrgDb = Pick<PrismaClient, "organization">;
type OrgLite = { id: string; name: string };
type OrgResult = { ok: true; org: OrgLite } | { ok: false; error: string };

// Resolve the organization a new invite targets: an existing org by id, or a
// freshly created one from a name (+ optional email domain). Never returns the
// default org implicitly — the caller must pick.
export async function resolveInviteOrg(
  input: { orgId?: string | null; newOrgName?: string | null; newOrgDomain?: string | null },
  deps: { db: OrgDb }
): Promise<OrgResult> {
  const db = deps.db;

  if (input.orgId) {
    const org = await db.organization.findUnique({
      where: { id: input.orgId },
      select: { id: true, name: true },
    });
    if (!org) return { ok: false, error: "That organization no longer exists." };
    return { ok: true, org };
  }

  const name = input.newOrgName?.trim();
  if (!name) return { ok: false, error: "Choose an organization or name a new one." };

  const domain = input.newOrgDomain?.trim().toLowerCase() || null;
  if (domain) {
    const clash = await db.organization.findUnique({
      where: { emailDomain: domain },
      select: { id: true },
    });
    if (clash) {
      return { ok: false, error: "That email domain already belongs to another organization." };
    }
  }

  const org = await db.organization.create({
    data: { name, emailDomain: domain, isDefault: false },
    select: { id: true, name: true },
  });
  return { ok: true, org };
}

type InviteRow = {
  id: string;
  email: string;
  organizationId: string;
  status: string;
};
type InviteDb = { orgAdminInvite: Pick<PrismaClient["orgAdminInvite"], "findUnique"> };
type InviteResult =
  | { ok: true; invite: InviteRow }
  | { ok: false; error: string };

// Load the pending invite for a raw token, or a friendly reason it can't be
// used. An accepted or revoked link fails the same way an unknown one does.
export async function loadPendingInvite(
  token: string,
  deps: { db: InviteDb }
): Promise<InviteResult> {
  if (!token) return { ok: false, error: "This invite link is invalid." };
  const invite = (await deps.db.orgAdminInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, organizationId: true, status: true },
  })) as InviteRow | null;
  if (!invite || invite.status !== "pending") {
    return { ok: false, error: "This invite link is no longer valid." };
  }
  return { ok: true, invite };
}

type UserDb = { user: Pick<PrismaClient["user"], "findUnique"> };

// True when an account already exists for this (lowercased) email.
export async function emailTaken(email: string, deps: { db: UserDb }): Promise<boolean> {
  const existing = await deps.db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return existing != null;
}
