/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashToken,
  mintToken,
  resolveInviteOrg,
  loadPendingInvite,
  emailTaken,
} from "./orgAdminInvite";

test("hashToken is deterministic and mintToken's hash matches its raw", () => {
  assert.equal(hashToken("abc"), hashToken("abc"));
  assert.notEqual(hashToken("abc"), hashToken("abd"));
  const { raw, hash } = mintToken();
  assert.equal(hash, hashToken(raw));
  assert.equal(raw.length, 64); // 32 bytes hex
});

function orgDb(over: any = {}): any {
  return {
    organization: {
      findUnique: async () => null,
      create: async ({ data, select }: any) => ({
        id: "org_new",
        ...(select?.name ? { name: data.name } : {}),
      }),
    },
    ...over,
  };
}

test("resolveInviteOrg returns an existing org by id", async () => {
  const db = orgDb({
    organization: {
      findUnique: async ({ where }: any) =>
        where.id === "org_malvern" ? { id: "org_malvern", name: "Malvern" } : null,
    },
  });
  const r = await resolveInviteOrg({ orgId: "org_malvern" }, { db });
  assert.deepEqual(r, { ok: true, org: { id: "org_malvern", name: "Malvern" } });
});

test("resolveInviteOrg errors when the picked org is gone", async () => {
  const r = await resolveInviteOrg({ orgId: "ghost" }, { db: orgDb() });
  assert.equal(r.ok, false);
});

test("resolveInviteOrg creates a new org from a name", async () => {
  let created: any = null;
  const db = orgDb({
    organization: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        created = data;
        return { id: "org_new", name: data.name };
      },
    },
  });
  const r = await resolveInviteOrg({ newOrgName: "  New Chapter  " }, { db });
  assert.equal(r.ok, true);
  assert.equal((r as any).org.name, "New Chapter");
  assert.equal(created.name, "New Chapter");
  assert.equal(created.emailDomain, null);
  assert.equal(created.isDefault, false);
});

test("resolveInviteOrg rejects a duplicate email domain", async () => {
  const db = orgDb({
    organization: {
      findUnique: async ({ where }: any) =>
        where.emailDomain === "taken.org" ? { id: "org_x" } : null,
      create: async () => assert.fail("should not create on domain clash"),
    },
  });
  const r = await resolveInviteOrg(
    { newOrgName: "Dupe", newOrgDomain: "Taken.org" },
    { db }
  );
  assert.equal(r.ok, false);
});

test("resolveInviteOrg needs an org id or a new name", async () => {
  const r = await resolveInviteOrg({ newOrgName: "   " }, { db: orgDb() });
  assert.equal(r.ok, false);
});

function inviteDb(status: string | null): any {
  return {
    orgAdminInvite: {
      findUnique: async () =>
        status == null
          ? null
          : { id: "inv1", email: "a@b.org", organizationId: "org1", status },
    },
  };
}

test("loadPendingInvite accepts a pending token", async () => {
  const r = await loadPendingInvite("tok", { db: inviteDb("pending") });
  assert.equal(r.ok, true);
  assert.equal((r as any).invite.id, "inv1");
});

test("loadPendingInvite rejects revoked, accepted, and unknown tokens", async () => {
  for (const s of ["revoked", "accepted", null]) {
    const r = await loadPendingInvite("tok", { db: inviteDb(s) });
    assert.equal(r.ok, false);
  }
  const empty = await loadPendingInvite("", { db: inviteDb("pending") });
  assert.equal(empty.ok, false);
});

test("emailTaken reflects whether a user exists", async () => {
  const yes = await emailTaken("X@Y.org", {
    db: { user: { findUnique: async () => ({ id: "u1" }) } } as any,
  });
  assert.equal(yes, true);
  const no = await emailTaken("x@y.org", {
    db: { user: { findUnique: async () => null } } as any,
  });
  assert.equal(no, false);
});
