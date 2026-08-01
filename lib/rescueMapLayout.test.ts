import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Structural guard for the docked `lg` layout in components/RescueMap.tsx.
//
// The selection panel carries `lg:static lg:flex-1`, which only means anything
// if the panel is a CHILD of the overlay container (`lg:flex lg:flex-col`).
// When it isn't, `lg:static` drops the panel out of absolute positioning into
// the map area's normal block flow, where it renders *below* the full-height
// map canvas and pushes the map up — which is exactly what shipped once.
//
// Nothing else in the suite can see this: typecheck, lint and a production
// build all pass either way, and the SSR markup contains the same strings.
// So the invariant is asserted directly against the source.

const SRC = readFileSync(
  join(process.cwd(), "components/RescueMap.tsx"),
  "utf8",
).split("\n");

/** Depth of `<div>` nesting at each line, counted from the component root. */
function divDepths(lines: string[]): { line: string; depth: number }[] {
  const rootIdx = lines.findIndex(
    (l) => l.trim() === '<div className="relative flex h-full w-full flex-col">',
  );
  assert.notEqual(rootIdx, -1, "component root div not found");

  const out: { line: string; depth: number }[] = [];
  let depth = 0;
  for (let i = rootIdx; i < lines.length; i++) {
    const l = lines[i];
    const opens = (l.match(/<div\b/g) ?? []).length;
    const selfClosing = (l.match(/<div\b[^>]*\/>/g) ?? []).length;
    const closes = (l.match(/<\/div>/g) ?? []).length;
    const before = depth;
    depth += opens - closes - selfClosing;
    // Attribute the *opening* depth to lines that open, closing depth otherwise.
    out.push({ line: l, depth: opens > closes ? depth : before });
    if (depth === 0 && i > rootIdx) break;
  }
  return out;
}

test("the selection panel is nested inside the overlay column", () => {
  const depths = divDepths(SRC);

  const overlay = depths.findIndex((d) =>
    d.line.includes("pointer-events-none absolute inset-0"),
  );
  assert.notEqual(overlay, -1, "overlay container not found");

  const panel = depths.findIndex((d) => d.line.trim() === "{panel && (");
  assert.notEqual(panel, -1, "panel block not found");
  assert.ok(panel > overlay, "panel should appear after the overlay opens");

  // A child of the overlay sits AT the overlay's interior depth, so comparing
  // depths alone is ambiguous. The unambiguous test is ordering: find where the
  // overlay closes (depth first drops below its interior) and require the panel
  // to start before that.
  const interior = depths[overlay].depth;
  const overlayCloses = depths.findIndex(
    (d, i) => i > overlay && d.depth < interior,
  );
  assert.notEqual(overlayCloses, -1, "overlay never closes");

  assert.ok(
    panel < overlayCloses,
    `the panel block starts after the overlay closes, so it is a SIBLING of ` +
      `the overlay (depth ${depths[panel].depth} vs interior ${interior}). It ` +
      `must be a child for lg:flex-1 / lg:static to work — as a sibling it ` +
      `falls into the map area's block flow at lg and renders below the map, ` +
      `pushing the map up.`,
  );
});

test("the panel re-enables pointer events at every width, not just lg", () => {
  // The overlay is pointer-events-none. Scoping the panel's re-enable to `lg`
  // would leave the bottom sheet dead to touch on phones — the primary device.
  const panelClass = SRC.find(
    (l) => l.includes("animate-fade-in") && l.includes("lg:static"),
  );
  assert.ok(panelClass, "panel className line not found");
  assert.match(
    panelClass,
    /(^|\s|")pointer-events-auto/,
    "panel needs an unscoped pointer-events-auto",
  );
});
