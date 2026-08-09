import type { Role } from "@prisma/client";

// Central role predicates. `super_admin` is the global master admin; `org_admin`
// is scoped to its own organization. Keeping these in one place lets the guard
// layer grant super_admin blanket access without editing every call site.

export function isSuperAdmin(role: Role | null | undefined): boolean {
  return role === "super_admin";
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === "org_admin" || role === "super_admin";
}

// Carrying a pickup is a volunteer job, and only a volunteer's. Restaurants
// post the surplus, drop-offs receive it, and admins (org + master) oversee the
// operation — none of them claim, deliver, or buddy a rescue, so none of them
// see the pickup surfaces. Note super_admin does NOT pass this gate: it opens
// every *viewing* door, but claiming is an operational act, not oversight.
export function canClaimPickups(role: Role | null | undefined): boolean {
  return role === "volunteer";
}

// True when `role` may pass a gate that lists `allowed` roles. A super admin
// passes every gate; everyone else must be explicitly listed.
export function roleAllowed(
  role: Role | null | undefined,
  allowed: Role[]
): boolean {
  if (!role) return false;
  return isSuperAdmin(role) || allowed.includes(role);
}
