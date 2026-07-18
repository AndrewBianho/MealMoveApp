/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { orgForEmail } from "./org";

const ORGS = [
  { id: "org_malvern", name: "Malvern", emailDomain: "malvernprep.org", isDefault: false },
  { id: "org_default_cfr", name: "None", emailDomain: null, isDefault: true },
];

function db(over: any = {}): any {
  return {
    organization: {
      findUnique: async ({ where }: any) =>
        ORGS.find((o) => o.emailDomain === where.emailDomain) ?? null,
      findFirst: async ({ where }: any) =>
        where?.isDefault ? ORGS.find((o) => o.isDefault) ?? null : ORGS[0],
    },
    ...over,
  };
}

test("matches a domain to its org", async () => {
  const o = await orgForEmail("Ava.Kim@malvernprep.org", { db: db() });
  assert.equal(o.id, "org_malvern");
});

test("falls back to the default org for an unmatched domain", async () => {
  const o = await orgForEmail("someone@gmail.com", { db: db() });
  assert.equal(o.id, "org_default_cfr");
});

test("is case-insensitive on the domain", async () => {
  const o = await orgForEmail("x@MalvernPrep.ORG", { db: db() });
  assert.equal(o.id, "org_malvern");
});

test("malformed email (no @) falls back to default", async () => {
  const o = await orgForEmail("not-an-email", { db: db() });
  assert.equal(o.id, "org_default_cfr");
});
