export const PII_DENYLIST = [
  "name", "firstName", "lastName", "phone", "email",
  "address", "lat", "lng", "latitude", "longitude", "coordinates",
] as const;

export function sanitizeProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const deny = new Set<string>(PII_DENYLIST);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!deny.has(k)) out[k] = v;
  }
  return out;
}
