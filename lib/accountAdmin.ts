import type { Role } from "@prisma/client";
import { isAdmin, isSuperAdmin } from "./roles";
import { assertSameOrg } from "./orgRoster";

type TargetLite = {
  id: string;
  role: Role;
  organizationId: string | null;
};

export type RoleChangeInput = {
  actorRole: Role;
  actorId: string;
  actorOrgId: string | null;
  target: TargetLite;
  newRole: Role;
  orgAdminCount: number; // active org_admins in the target's org
  superAdminCount: number; // total super_admins system-wide
};

export type DeleteAccountInput = {
  actorRole: Role;
  actorId: string;
  actorOrgId: string | null;
  target: TargetLite & { status: string };
  orgAdminCount: number;
  superAdminCount: number;
};

const MANAGED: Role[] = ["volunteer", "org_admin", "super_admin"];

// Returns an error string if the role change is disallowed, else null.
export function roleChangeError(i: RoleChangeInput): string | null {
  if (!isAdmin(i.actorRole)) return "Only org admins can change roles.";

  // Allowed target roles: org admins may set volunteer/org_admin; only a super
  // admin may set super_admin.
  const allowedTargets: Role[] = isSuperAdmin(i.actorRole)
    ? ["volunteer", "org_admin", "super_admin"]
    : ["volunteer", "org_admin"];
  if (!allowedTargets.includes(i.newRole)) return "Invalid role.";

  if (i.target.role === "restaurant" || i.target.role === "drop_off") {
    return "Partner accounts are managed at sign-up.";
  }

  // Only a super admin may touch a super_admin target.
  if (i.target.role === "super_admin" && !isSuperAdmin(i.actorRole)) {
    return "Only a master admin can change a master admin.";
  }

  // Cross-org: non-super actors act only within their own org.
  if (
    !isSuperAdmin(i.actorRole) &&
    !assertSameOrg(i.actorOrgId, i.target.organizationId)
  ) {
    return "You can only manage members in your own organization.";
  }

  if (i.target.role === i.newRole) return null; // no-op

  // Self lockout: don't let a super admin strip their own master-admin access.
  if (
    i.target.id === i.actorId &&
    isSuperAdmin(i.target.role) &&
    i.newRole !== "super_admin"
  ) {
    return "You can't remove your own master-admin access.";
  }

  // Last-admin guards.
  if (
    i.target.role === "org_admin" &&
    i.newRole !== "org_admin" &&
    i.orgAdminCount <= 1
  ) {
    return "Can't remove the last org admin.";
  }
  if (
    i.target.role === "super_admin" &&
    i.newRole !== "super_admin" &&
    i.superAdminCount <= 1
  ) {
    return "Can't remove the last master admin.";
  }

  return null;
}

// Returns an error string if the deletion is disallowed, else null. A "deleted"
// target returns null (idempotent no-op).
export function deleteAccountError(i: DeleteAccountInput): string | null {
  if (!isAdmin(i.actorRole)) return "Only org admins can delete accounts.";
  if (i.target.id === i.actorId) return "You can't delete your own account.";
  if (i.target.status === "deleted") return null;
  if (i.target.status === "pending") {
    return "Pending accounts are handled with Decline.";
  }

  // Only a super admin may delete a super_admin.
  if (i.target.role === "super_admin" && !isSuperAdmin(i.actorRole)) {
    return "Only a master admin can remove a master admin.";
  }

  // Cross-org guard for managed roles (partners are global).
  if (
    MANAGED.includes(i.target.role) &&
    !isSuperAdmin(i.actorRole) &&
    !assertSameOrg(i.actorOrgId, i.target.organizationId)
  ) {
    return "You can only manage members in your own organization.";
  }

  if (i.target.role === "org_admin" && i.orgAdminCount <= 1) {
    return "Can't remove the last org admin.";
  }
  if (i.target.role === "super_admin" && i.superAdminCount <= 1) {
    return "Can't remove the last master admin.";
  }

  return null;
}
