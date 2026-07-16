import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

// The chapter this deployment runs for. Kept as an app-wide brand/fallback
// string (e.g. the profile org line falls back to it when a user has no org).
// Volunteer organizations (below) are the real per-user grouping.
export const CHAPTER_NAME = "Campus Food Rescue";

type OrgDb = Pick<PrismaClient, "organization">;
type OrgLite = { id: string; name: string };

// The single fallback organization for volunteers whose email domain matches no
// org. The migration always seeds exactly one isDefault row, so this should
// never be missing in a migrated database.
export async function defaultOrg(deps: { db?: OrgDb } = {}): Promise<OrgLite> {
  const db = deps.db ?? prisma;
  const org = await db.organization.findFirst({ where: { isDefault: true } });
  if (!org) throw new Error("No default organization is configured.");
  return { id: org.id, name: org.name };
}

// Which organization a sign-up email joins: the org whose emailDomain matches
// (case-insensitive), else the default org. Never returns null.
export async function orgForEmail(
  email: string,
  deps: { db?: OrgDb } = {}
): Promise<OrgLite> {
  const db = deps.db ?? prisma;
  const at = email.lastIndexOf("@");
  const domain = at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
  if (domain) {
    const match = await db.organization.findUnique({ where: { emailDomain: domain } });
    if (match) return { id: match.id, name: match.name };
  }
  return defaultOrg({ db });
}
