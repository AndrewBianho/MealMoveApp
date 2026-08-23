import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAPTERS,
  TOUR_STEPS,
  positionOf,
  stepsInChapter,
} from "./tour/steps";

test("there are five chapters, numbered 1..5 in order", () => {
  assert.equal(CHAPTERS.length, 5);
  assert.deepEqual(CHAPTERS.map((c) => c.n), [1, 2, 3, 4, 5]);
});

test("every chapter has at least one step", () => {
  for (const c of CHAPTERS) {
    assert.ok(stepsInChapter(c.n).length > 0, `chapter ${c.n} is empty`);
  }
});

test("step ids are unique", () => {
  const ids = TOUR_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("anchor names are unique", () => {
  const a = TOUR_STEPS.map((s) => s.anchor);
  assert.equal(new Set(a).size, a.length);
});

test("every step has a non-empty anchor and body", () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.anchor.length > 0, `${s.id} has no anchor`);
    assert.ok(s.body.length > 0, `${s.id} has no body`);
  }
});

test("steps are grouped: a chapter's steps are contiguous in the list", () => {
  const seen: number[] = [];
  for (const s of TOUR_STEPS) {
    if (seen[seen.length - 1] !== s.chapter) seen.push(s.chapter);
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5], "chapters must not interleave");
});

test("routes start with a slash", () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.route.startsWith("/"), `${s.id} route ${s.route}`);
  }
});

test("positionOf reports the step's place within its own chapter", () => {
  const first = TOUR_STEPS[0];
  assert.deepEqual(positionOf(first), {
    chapter: 1,
    chapterOf: 5,
    step: 1,
    stepOf: stepsInChapter(1).length,
  });

  const lastOfCh1 = stepsInChapter(1).at(-1)!;
  const p = positionOf(lastOfCh1);
  assert.equal(p.step, p.stepOf, "last step of a chapter is step N of N");
});

test("the step that demonstrates the takeover expects the listing route", () => {
  // Clicking Home while holding a claim redirects back to the listing
  // (app/(feed)/page.tsx). If this step's route were "/", the tour desyncs.
  const s = TOUR_STEPS.find((x) => x.id === "takeover");
  assert.ok(s, "takeover step missing");
  assert.equal(s!.route, "/listings/:id");
  assert.equal(s!.advance, "click");
});

test("exactly one step mutates demo data", () => {
  const writes = TOUR_STEPS.filter((s) => s.writes);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, "claim");
});
