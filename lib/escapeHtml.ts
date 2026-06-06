// Escape user-supplied text before interpolating it into the raw HTML strings
// we build by hand for Mapbox popups (ListingsMap / RescueMap). Those popups
// are raw DOM, so React's escaping doesn't apply.
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}
