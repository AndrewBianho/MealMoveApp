import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldQueueUpload } from "./uploadQueue";

test("shouldQueueUpload: offline always queues", () => {
  assert.equal(shouldQueueUpload(false, null), true);
  assert.equal(shouldQueueUpload(false, new Error("anything")), true);
});

test("shouldQueueUpload: online + network-shaped error queues", () => {
  assert.equal(shouldQueueUpload(true, new TypeError("Failed to fetch")), true);
  assert.equal(shouldQueueUpload(true, new Error("Network request failed")), true);
  assert.equal(shouldQueueUpload(true, new Error("Load failed")), true);
});

test("shouldQueueUpload: online + real app error does NOT queue", () => {
  assert.equal(shouldQueueUpload(true, new Error("File too large")), false);
  assert.equal(shouldQueueUpload(true, new Error("Upload failed.")), false);
  assert.equal(shouldQueueUpload(true, null), false);
});
