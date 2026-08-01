// Generates public/surface-contours.svg — the app background's topographic
// contour field (see DESIGN.md → "Surface texture").
//
//   node scripts/gen-surface-contours.mjs public/surface-contours.svg
//
// Nested closed curves around a few centres, like elevation rings. Sinusoidal
// radius perturbation keeps them organic; nesting with a slow phase drift keeps
// neighbouring rings from running parallel.
//
// Authored as real paths rather than generated in-browser from an feTurbulence
// filter: banding smooth noise with feComponentTransfer `discrete` thresholds a
// per-pixel field, so the level-set edges come out aliased and ragged. Paths
// give clean curves and full control over density.
//
// The output tiles seamlessly (see `wrapped`), so the CSS repeats it at a fixed
// 1600x1000 rather than using `cover` — under `background-attachment: scroll`,
// `cover` resolves against the whole document height and blows the field up to
// several times its intended scale on a long page.
import { writeFileSync } from "node:fs";

const W = 1600;
const H = 1000;

// Deterministic RNG so regenerating gives the same field.
let s = 20260721;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// Each centre: where, how many rings, ring spacing, and the wobble harmonics.
const CENTRES = [
  { cx: 210, cy: 170, rings: 9, step: 46, base: 40 },
  { cx: 1370, cy: 120, rings: 8, step: 52, base: 46 },
  { cx: 1180, cy: 830, rings: 10, step: 44, base: 36 },
  { cx: 430, cy: 900, rings: 7, step: 50, base: 44 },
  { cx: 800, cy: 480, rings: 6, step: 58, base: 60 },
];

function ring(cx, cy, r, harmonics, drift) {
  const N = 96;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    let rad = r;
    for (const h of harmonics) {
      // Amplitude scales with radius so big rings wobble proportionally, and
      // `drift` rotates each ring's phase a little so rings aren't concentric
      // clones of each other.
      rad += r * h.a * Math.sin(h.k * t + h.p + drift);
    }
    pts.push([cx + Math.cos(t) * rad, cy + Math.sin(t) * rad * 0.82]);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    d: "M" + pts.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join("L") + "Z",
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

// A ring that crosses a tile edge has to reappear on the opposite edge or the
// tile shows a seam when it repeats. Emit a translated copy for each of the 8
// neighbouring tile positions the ring actually reaches into — bbox-tested, so
// interior rings (most of them) stay single.
function wrapped({ d, bbox }, W, H) {
  const [x0, y0, x1, y1] = bbox;
  const out = [];
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      if (x1 + dx < 0 || x0 + dx > W || y1 + dy < 0 || y0 + dy > H) continue;
      out.push(
        dx === 0 && dy === 0
          ? `<path d="${d}"/>`
          : `<path d="${d}" transform="translate(${dx} ${dy})"/>`
      );
    }
  }
  return out;
}

const paths = [];
for (const c of CENTRES) {
  const harmonics = [
    { k: 2, a: 0.16 + rnd() * 0.1, p: rnd() * 6.28 },
    { k: 3, a: 0.09 + rnd() * 0.06, p: rnd() * 6.28 },
    { k: 5, a: 0.04 + rnd() * 0.03, p: rnd() * 6.28 },
  ];
  for (let i = 0; i < c.rings; i++) {
    const r = c.base + i * c.step;
    paths.push(...wrapped(ring(c.cx, c.cy, r, harmonics, i * 0.14), W, H));
  }
}

// clipPath keeps the wrapped copies from painting outside the tile, so the SVG
// occupies exactly its declared box when it repeats.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<clipPath id="t"><rect width="${W}" height="${H}"/></clipPath>
<g clip-path="url(#t)" fill="none" stroke="#211D19" stroke-width="1.5" opacity="0.07">
${paths.join("\n")}
</g>
</svg>
`;

writeFileSync(process.argv[2], svg);
console.log(`wrote ${process.argv[2]} — ${paths.length} rings, ${(svg.length / 1024).toFixed(1)} kB`);
