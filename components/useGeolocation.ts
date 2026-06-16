import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/distance";

// Asks the browser once for the volunteer's location. Stays null until (or
// unless) it resolves — denial, an insecure origin, or no support all leave it
// null, so callers keep their graceful fallback. One fix is enough to label
// "how far" on the feed; skipping watchPosition avoids a battery-hungry
// subscription. The browser Geolocation API is free, so this adds no fees.
export function useGeolocation(): LatLng | null {
  const [coords, setCoords] = useState<LatLng | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (alive) {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      },
      () => {
        // Denied or unavailable: stay null and let the UI keep its "—".
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10_000 }
    );
    return () => {
      alive = false;
    };
  }, []);

  return coords;
}
