import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_START,
  clearTrip,
  emptyTrip,
  hydrateTrip,
  setSlot,
  slotForKind,
  toggleEntity,
  type Stop,
} from "./tripPlan";

const bakery: Stop = { kind: "rest", id: "r1", center: [-75.5, 40.0], label: "Sunrise Bakery" };
const deli: Stop = { kind: "rest", id: "r2", center: [-75.6, 40.1], label: "Corner Deli" };
const shelter: Stop = { kind: "drop", id: "d1", center: [-75.4, 40.2], label: "St. Mark's Shelter" };

test("slotForKind maps entity kinds to slots", () => {
  assert.equal(slotForKind("rest"), "pickup");
  assert.equal(slotForKind("drop"), "dropOff");
});

test("clicking a restaurant fills the pickup slot", () => {
  const plan = toggleEntity(emptyTrip(), bakery);
  assert.deepEqual(plan.pickup, bakery);
  assert.equal(plan.dropOff, null);
});

test("clicking a different restaurant replaces the pickup", () => {
  const plan = toggleEntity(toggleEntity(emptyTrip(), bakery), deli);
  assert.deepEqual(plan.pickup, deli);
});

test("clicking the restaurant already in the slot clears it", () => {
  const plan = toggleEntity(toggleEntity(emptyTrip(), bakery), bakery);
  assert.equal(plan.pickup, null);
});

test("restaurant and drop-off occupy independent slots", () => {
  const plan = toggleEntity(toggleEntity(emptyTrip(), bakery), shelter);
  assert.deepEqual(plan.pickup, bakery);
  assert.deepEqual(plan.dropOff, shelter);
});

test("setSlot can clear a slot explicitly", () => {
  const plan = setSlot(toggleEntity(emptyTrip(), bakery), "pickup", null);
  assert.equal(plan.pickup, null);
});

test("clearTrip keeps start but empties the rest", () => {
  const start: Stop = { kind: "place", center: [-75.1, 40.9], label: "Home" };
  let plan = setSlot(emptyTrip(), "start", start);
  plan = toggleEntity(plan, bakery);
  plan = toggleEntity(plan, shelter);
  plan = setSlot(plan, "end", { kind: "place", center: [-75.2, 40.8], label: "Campus" });

  const cleared = clearTrip(plan);
  assert.deepEqual(cleared.start, start);
  assert.equal(cleared.pickup, null);
  assert.equal(cleared.dropOff, null);
  assert.equal(cleared.end, null);
});

test("emptyTrip defaults start to DEFAULT_START", () => {
  assert.deepEqual(emptyTrip().start, DEFAULT_START);
});

test("hydrate round-trips a serialized plan", () => {
  let plan = toggleEntity(emptyTrip(), bakery);
  plan = toggleEntity(plan, shelter);

  const restored = hydrateTrip(
    JSON.parse(JSON.stringify(plan)),
    new Set(["r1"]),
    new Set(["d1"])
  );
  assert.deepEqual(restored, plan);
});

test("hydrate drops a stop whose entity no longer exists", () => {
  let plan = toggleEntity(emptyTrip(), bakery);
  plan = toggleEntity(plan, shelter);

  const restored = hydrateTrip(plan, new Set<string>(), new Set(["d1"]));
  assert.equal(restored.pickup, null, "stale restaurant id must not survive hydration");
  assert.deepEqual(restored.dropOff, shelter);
});

test("hydrate replaces a start whose entity no longer exists", () => {
  const staleStart = { start: bakery, pickup: null, dropOff: null, end: null };
  const restored = hydrateTrip(staleStart, new Set<string>(), new Set<string>());
  assert.deepEqual(restored.start, DEFAULT_START);
});

test("hydrate keeps free-form place stops regardless of known ids", () => {
  const end: Stop = { kind: "place", center: [-75.2, 40.8], label: "Campus" };
  const plan = setSlot(emptyTrip(), "end", end);
  const restored = hydrateTrip(plan, new Set<string>(), new Set<string>());
  assert.deepEqual(restored.end, end);
});

test("hydrate returns an empty trip for corrupt input", () => {
  assert.deepEqual(hydrateTrip("not json at all", new Set(), new Set()), emptyTrip());
  assert.deepEqual(hydrateTrip(null, new Set(), new Set()), emptyTrip());
  assert.deepEqual(hydrateTrip({ start: { kind: "bogus" } }, new Set(), new Set()), emptyTrip());
});
