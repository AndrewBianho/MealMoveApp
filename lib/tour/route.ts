// Does a tour step's route pattern describe the page we're on?
//
// Deliberately tiny: the only wildcard is ":id", matching exactly one segment,
// which is all the tour's routes need. Kept separate from steps.ts so it can be
// tested against pathnames without importing the whole script.

export function matchesRoute(pattern: string, pathname: string): boolean {
  const strip = (s: string) => (s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s);
  const p = strip(pattern).split("/");
  const q = strip(pathname).split("/");
  if (p.length !== q.length) return false;
  return p.every((seg, i) => (seg.startsWith(":") ? q[i].length > 0 : seg === q[i]));
}
