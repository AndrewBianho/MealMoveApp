import { test } from "node:test";
import assert from "node:assert/strict";
import { roleChangeError, deleteAccountError } from "./accountAdmin";

const base = {
  actorId: "actor",
  actorOrgId: "orgA",
  orgAdminCount: 3,
  superAdminCount: 2,
};

test("org admin cannot change roles across orgs", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "org_admin",
    target: { id: "t", role: "volunteer", organizationId: "orgB" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /your own organization/);
});

test("super admin may promote a volunteer in another org", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "t", role: "volunteer", organizationId: "orgB" },
    newRole: "org_admin",
  });
  assert.equal(err, null);
});

test("org admin cannot grant super_admin", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "org_admin",
    target: { id: "t", role: "volunteer", organizationId: "orgA" },
    newRole: "super_admin",
  });
  assert.match(err ?? "", /Invalid role/);
});

test("super admin may grant super_admin", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "t", role: "org_admin", organizationId: "orgB" },
    newRole: "super_admin",
  });
  assert.equal(err, null);
});

test("org admin cannot modify a super_admin target", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "org_admin",
    target: { id: "t", role: "super_admin", organizationId: "orgA" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /master admin/);
});

test("cannot demote the last super admin", () => {
  const err = roleChangeError({
    ...base,
    superAdminCount: 1,
    actorRole: "super_admin",
    target: { id: "t", role: "super_admin", organizationId: "orgA" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /last master admin/);
});

test("super admin cannot strip their own master-admin access", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "actor", role: "super_admin", organizationId: "orgA" },
    newRole: "org_admin",
  });
  assert.match(err ?? "", /your own master-admin/);
});

test("partner roles are not changeable here", () => {
  const err = roleChangeError({
    ...base,
    actorRole: "super_admin",
    target: { id: "t", role: "restaurant", organizationId: null },
    newRole: "volunteer",
  });
  assert.match(err ?? "", /managed at sign-up/);
});

test("last org admin cannot be demoted", () => {
  const err = roleChangeError({
    ...base,
    orgAdminCount: 1,
    actorRole: "org_admin",
    target: { id: "t", role: "org_admin", organizationId: "orgA" },
    newRole: "volunteer",
  });
  assert.match(err ?? "", /last org admin/);
});

test("deleteAccountError: super admin deletes across orgs, org admin cannot", () => {
  assert.equal(
    deleteAccountError({
      ...base,
      actorRole: "super_admin",
      target: { id: "t", role: "volunteer", status: "active", organizationId: "orgB" },
    }),
    null
  );
  assert.match(
    deleteAccountError({
      ...base,
      actorRole: "org_admin",
      target: { id: "t", role: "volunteer", status: "active", organizationId: "orgB" },
    }) ?? "",
    /your own organization/
  );
});

test("deleteAccountError: cannot delete self, last super admin, or a super admin as org admin", () => {
  assert.match(
    deleteAccountError({
      ...base,
      actorRole: "super_admin",
      target: { id: "actor", role: "super_admin", status: "active", organizationId: "orgA" },
    }) ?? "",
    /your own account/
  );
  assert.match(
    deleteAccountError({
      ...base,
      superAdminCount: 1,
      actorRole: "super_admin",
      target: { id: "t", role: "super_admin", status: "active", organizationId: "orgA" },
    }) ?? "",
    /last master admin/
  );
  assert.match(
    deleteAccountError({
      ...base,
      actorRole: "org_admin",
      target: { id: "t", role: "super_admin", status: "active", organizationId: "orgA" },
    }) ?? "",
    /master admin/
  );
});

test("roleChangeError returns null for a same-role no-op", () => {
  assert.equal(
    roleChangeError({
      ...base,
      actorRole: "org_admin",
      target: { id: "t", role: "volunteer", organizationId: "orgA" },
      newRole: "volunteer",
    }),
    null
  );
});

test("roleChangeError allows demoting a non-last super admin", () => {
  assert.equal(
    roleChangeError({
      ...base,
      superAdminCount: 2,
      actorRole: "super_admin",
      target: { id: "t", role: "super_admin", organizationId: "orgB" },
      newRole: "org_admin",
    }),
    null
  );
});

test("deleteAccountError allows any admin to delete a partner account cross-org", () => {
  const partner = {
    id: "t",
    role: "restaurant" as const,
    status: "active",
    organizationId: null,
  };
  assert.equal(
    deleteAccountError({ ...base, actorRole: "org_admin", target: partner }),
    null
  );
  assert.equal(
    deleteAccountError({ ...base, actorRole: "super_admin", target: partner }),
    null
  );
});
