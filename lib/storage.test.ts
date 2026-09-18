// The upload path decides a stored object's content type from its bytes, never
// from the caller's declared MIME type. These lock that in — especially the
// SVG case, which passes an `image/*` check but is a script-capable document
// served from a public bucket.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffImageType } from "./storage";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(6)]);
const webp = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.alloc(4),
  Buffer.from("WEBP", "latin1"),
]);

test("sniffImageType recognizes the four supported rasters", () => {
  assert.deepEqual(sniffImageType(jpeg), { type: "image/jpeg", ext: "jpg" });
  assert.deepEqual(sniffImageType(png), { type: "image/png", ext: "png" });
  assert.deepEqual(sniffImageType(gif), { type: "image/gif", ext: "gif" });
  assert.deepEqual(sniffImageType(webp), { type: "image/webp", ext: "webp" });
});

test("sniffImageType refuses SVG even though it is an image/* type", () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    "utf8"
  );
  assert.equal(sniffImageType(svg), null);
});

test("sniffImageType refuses HTML, scripts, and truncated input", () => {
  assert.equal(sniffImageType(Buffer.from("<!DOCTYPE html><html>", "utf8")), null);
  assert.equal(sniffImageType(Buffer.from("GIF87", "latin1")), null, "too short to classify");
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
});

test("a JPEG header decides the type even when the file claims to be SVG", () => {
  // The route's `file.type` says image/svg+xml; the bytes say JPEG. Bytes win,
  // so the object is stored as image/jpeg and cannot execute.
  assert.equal(sniffImageType(jpeg)?.type, "image/jpeg");
});
