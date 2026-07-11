// Build a Google Maps directions URL for a rescue. The origin is left to Google
// (it uses the volunteer's current location), and when both legs are known the
// pickup rides as an intermediate waypoint — so one tap gives a claimed
// volunteer "you → pickup → drop-off". Falls back to just the pickup before a
// drop-off is set, and returns null when there's nothing to navigate to.
export interface LatLng {
  lat: number;
  lng: number;
}

export function googleMapsDirectionsUrl(opts: {
  pickup?: LatLng | null;
  dropOff?: LatLng | null;
}): string | null {
  const { pickup, dropOff } = opts;
  // Final destination is the drop-off once known, otherwise the pickup.
  const destination = dropOff ?? pickup;
  if (!destination) return null;
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "driving",
  });
  // Both legs known → route through the pickup on the way to the drop-off.
  if (dropOff && pickup) {
    params.set("waypoints", `${pickup.lat},${pickup.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
