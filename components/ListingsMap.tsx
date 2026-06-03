"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { Listing } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Same urgency palette as the listing-card strip (tokens from tailwind.config).
function urgencyColor(l: Listing): string {
  if (["delivered", "expired", "failed"].includes(l.status)) return "#888780";
  if (l.minutesLeft < 10) return "#E24B4A";
  if (l.minutesLeft < 35) return "#BA7517";
  return "#639922";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
}

// Great-circle distance in miles.
function milesBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Located = Listing & { lat: number; lng: number };

function popupHtml(l: Located, distanceMi?: number): string {
  const distance =
    distanceMi != null
      ? `<div style="color:#3B6D11;font-family:monospace;font-size:11px;margin-bottom:6px;">${distanceMi.toFixed(1)} mi from you</div>`
      : "";
  return `<div style="font-family:-apple-system,system-ui,sans-serif;">
      <div style="font-size:13px;font-weight:500;">${escapeHtml(l.title)}</div>
      <div style="color:#5F5E5A;font-family:monospace;font-size:11px;margin:2px 0 6px;">${escapeHtml(l.source)} · ~${l.servings} servings</div>
      ${distance}
      <a href="/listings/${l.id}" style="color:#3B6D11;font-size:13px;font-weight:500;text-decoration:none;">View details →</a>
    </div>`;
}

export function ListingsMap({ listings }: { listings: Listing[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TOKEN || !ref.current) return;
    const withCoords = listings.filter(
      (l): l is Located => typeof l.lat === "number" && typeof l.lng === "number"
    );

    let map: MapboxMap | undefined;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !ref.current) return;
      mapboxgl.accessToken = TOKEN;

      map = new mapboxgl.Map({
        container: ref.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: withCoords.length
          ? [withCoords[0].lng, withCoords[0].lat]
          : [-75.34, 40.04],
        zoom: 13,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      // "You are here" — live location with a recenter button.
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      });
      map.addControl(geolocate, "top-right");

      const entries = withCoords.map((l) => {
        const el = document.createElement("div");
        el.style.cssText = `width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2);background:${urgencyColor(l)};cursor:pointer;`;
        const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
          popupHtml(l)
        );
        new mapboxgl.Marker(el).setLngLat([l.lng, l.lat]).setPopup(popup).addTo(map!);
        return { listing: l, popup };
      });

      // Once located, fold "distance from you" into every popup.
      geolocate.on("geolocate", (e) => {
        const { latitude, longitude } = (e as GeolocationPosition).coords;
        for (const { listing, popup } of entries) {
          const d = milesBetween(latitude, longitude, listing.lat, listing.lng);
          popup.setHTML(popupHtml(listing, d));
        }
      });

      map.on("load", () => {
        if (withCoords.length > 1) {
          const bounds = new mapboxgl.LngLatBounds();
          withCoords.forEach((l) => bounds.extend([l.lng, l.lat]));
          map!.fitBounds(bounds, { padding: 64, maxZoom: 15 });
        }
        // Auto-locate the volunteer (prompts for permission; harmless if denied).
        geolocate.trigger();
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [listings]);

  if (!TOKEN) {
    return (
      <div className="grid h-[60vh] place-items-center rounded-xl border border-dashed border-neutral-200 bg-white text-center">
        <div>
          <p className="text-sm text-neutral-600">The map needs a Mapbox token.</p>
          <p className="mt-1 font-mono text-xs text-neutral-400">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to Code/.env, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="h-[60vh] w-full overflow-hidden rounded-xl border border-neutral-200/40"
    />
  );
}
