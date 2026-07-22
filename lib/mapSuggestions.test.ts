import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchEntities,
  mergeSuggestions,
  rememberRecent,
  type Suggestion,
} from "./mapSuggestions";
import type { Stop } from "./tripPlan";

const rests = [
  { id: "r1", name: "Sunrise Bakery", lat: 40.0, lng: -75.5 },
  { id: "r2", name: "Corner Deli", lat: 40.1, lng: -75.6 },
];
const drops = [{ id: "d1", name: "St. Mark's Shelter", lat: 40.2, lng: -75.4 }];

function sug(id: string, group: Suggestion["group"], label: string, stop: Stop): Suggestion {
  return { id, group, label, stop };
}

test("matchEntities finds restaurants and drop-offs case-insensitively", () => {
  const hits = matchEntities("sunrise", rests, drops);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].label, "Sunrise Bakery");
  assert.equal(hits[0].stop.kind, "rest");
});

test("matchEntities matches on a substring, not just a prefix", () => {
  assert.equal(matchEntities("deli", rests, drops).length, 1);
  assert.equal(matchEntities("shelter", rests, drops).length, 1);
});

test("matchEntities returns nothing for a blank query", () => {
  assert.deepEqual(matchEntities("   ", rests, drops), []);
});

test("mergeSuggestions ranks recent, then locations, then addresses", () => {
  const merged = mergeSuggestions(
    [sug("rec1", "recent", "Home", { kind: "place", center: [-75.1, 40.1], label: "Home" })],
    [sug("loc1", "location", "Sunrise Bakery", { kind: "rest", id: "r1", center: [-75.5, 40.0], label: "Sunrise Bakery" })],
    [sug("addr1", "address", "1 Lancaster Ave", { kind: "place", center: [-75.9, 40.9], label: "1 Lancaster Ave" })]
  );
  assert.deepEqual(
    merged.map((m) => m.group),
    ["recent", "location", "address"]
  );
});

test("an address at the same place as a known location is dropped", () => {
  const merged = mergeSuggestions(
    [],
    [sug("loc1", "location", "Sunrise Bakery", { kind: "rest", id: "r1", center: [-75.5, 40.0], label: "Sunrise Bakery" })],
    [sug("addr1", "address", "12 Main St", { kind: "place", center: [-75.50001, 40.00001], label: "12 Main St" })]
  );
  assert.equal(merged.length, 1, "duplicate place should collapse to the richer location entry");
  assert.equal(merged[0].group, "location");
});

test("mergeSuggestions caps the list", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    sug(`a${i}`, "address", `Addr ${i}`, { kind: "place", center: [-70 - i, 40], label: `Addr ${i}` })
  );
  assert.ok(mergeSuggestions([], [], many).length <= 8);
});

test("mergeSuggestions handles all-empty sources", () => {
  assert.deepEqual(mergeSuggestions([], [], []), []);
});

test("rememberRecent puts the newest first and de-duplicates", () => {
  const a: Stop = { kind: "place", center: [-75.1, 40.1], label: "Home" };
  const b: Stop = { kind: "place", center: [-75.2, 40.2], label: "Campus" };
  const list = rememberRecent(rememberRecent([a], b), a);
  assert.deepEqual(list.map((s) => s.label), ["Home", "Campus"]);
});

test("rememberRecent keeps at most three", () => {
  let list: Stop[] = [];
  for (let i = 0; i < 6; i++) {
    list = rememberRecent(list, { kind: "place", center: [-75 - i, 40], label: `P${i}` });
  }
  assert.equal(list.length, 3);
  assert.equal(list[0].label, "P5");
});
