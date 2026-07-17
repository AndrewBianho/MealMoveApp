import type { Prisma } from "@prisma/client";

// Roster scoping for org admins. Organizations group volunteers only, so the
// members roster keeps partner accounts (restaurant/drop_off) global — every
// org admin manages the shared partner pool — while volunteers and org admins
// are scoped to the acting admin's own organization.
const PARTNER_ROLES = ["restaurant", "drop_off"] as const;
const MANAGED_ROLES = ["volunteer", "org_admin", "super_admin"] as const;

// The `where` for the active-members roster. Partners are always included;
// managed roles (volunteer/org_admin/super_admin) are included only when scoped to
// `adminOrgId`, or globally when global mode is enabled. A null org (an admin not linked to one) shows partners only —
// a safe default that never leaks another org's volunteers.
export function rosterWhere(
  adminOrgId: string | null,
  demo: boolean,
  opts?: { global?: boolean }
): Prisma.UserWhereInput {
  const OR: Prisma.UserWhereInput[] = [{ role: { in: [...PARTNER_ROLES] } }];
  if (opts?.global) {
    // Master admin: every org's managed roles, no org filter.
    OR.push({ role: { in: [...MANAGED_ROLES] } });
  } else if (adminOrgId) {
    OR.push({ role: { in: [...MANAGED_ROLES] }, organizationId: adminOrgId });
  }
  return { status: "active", demo, OR };
}

// Cross-org guard: an actor may act on / view a managed target only when both
// belong to the same non-null org.
export function assertSameOrg(
  actorOrgId: string | null,
  targetOrgId: string | null
): boolean {
  return actorOrgId != null && targetOrgId != null && actorOrgId === targetOrgId;
}
