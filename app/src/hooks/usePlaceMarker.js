import { useEffect } from "react";
import { Marker } from "maplibre-gl";

// The point "What was this place?" describes (PlaceHistory.jsx), marked on the
// map as the Nearby compass marks its centre: one small diamond (no rings or
// cross lines: project rule, no weapon-like visuals). It takes no pointer
// events, so taps on the dots and clusters under it still reach the map.
export default function usePlaceMarker({ mapRef, mapReady, place }) {
  const lon = place?.lon;
  const lat = place?.lat;
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !Number.isFinite(lon) || !Number.isFinite(lat)) return undefined;
    const el = document.createElement("div");
    el.className = "mu-place-marker";
    el.setAttribute("aria-hidden", "true");
    // MapLibre positions the marker with the element's own transform: the
    // diamond's rotation goes on a child.
    el.appendChild(document.createElement("span")).className = "mu-place-marker-shape";
    const marker = new Marker({ element: el, anchor: "center" }).setLngLat([lon, lat]).addTo(map);
    return () => marker.remove();
  }, [mapRef, mapReady, lon, lat]);
}
