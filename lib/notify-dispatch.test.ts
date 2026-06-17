// `any` keeps the lightweight test doubles below readable.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchToUser, type NotifyPayload } from "./notify-dispatch";

const payload: NotifyPayload = {
  title: "t",
  body: "b",
  url: "/listings/x",
  email: { subject: "s", html: "<p>h</p>" },
};

function fakeDb(user: any, tokens: string[]) {
  const deleted: string[] = [];
  return {
    deleted,
    db: {
      user: { findUnique: async () => user },
      deviceToken: {
        findMany: async () => tokens.map((token) => ({ token })),
        deleteMany: async ({ where }: any) => {
          deleted.push(...where.token.in);
          return { count: where.token.in.length };
        },
      },
    } as any,
  };
}

test("sends nothing when notifications are disabled", async () => {
  const { db } = fakeDb({ email: "a@b.c", notificationsEnabled: false }, ["tok"]);
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 1, invalidTokens: [] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "none");
  assert.equal(emails.length, 0);
});

test("pushes when a token delivers, and prunes invalid tokens", async () => {
  const { db, deleted } = fakeDb(
    { email: "a@b.c", notificationsEnabled: true },
    ["good", "dead"]
  );
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 1, invalidTokens: ["dead"] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "push");
  assert.deepEqual(deleted, ["dead"]);
  assert.equal(emails.length, 0);
});

test("falls back to email when no token delivers", async () => {
  const { db, deleted } = fakeDb(
    { email: "a@b.c", notificationsEnabled: true },
    ["dead"]
  );
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 0, invalidTokens: ["dead"] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "email");
  assert.deepEqual(deleted, ["dead"]);
  assert.deepEqual(emails[0], ["a@b.c", "s", "<p>h</p>"]);
});

test("emails directly when the user has no tokens", async () => {
  const { db } = fakeDb({ email: "a@b.c", notificationsEnabled: true }, []);
  const emails: any[] = [];
  const res = await dispatchToUser("u1", payload, {
    db,
    push: async () => ({ delivered: 0, invalidTokens: [] }),
    email: async (...a) => void emails.push(a),
  });
  assert.equal(res.channel, "email");
  assert.equal(emails[0][0], "a@b.c");
});
