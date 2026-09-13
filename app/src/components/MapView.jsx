import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import boundariesData from "../data/boundaries.json";
import landData from "../data/land.json";

const CATEGORY_COLORS = {
  war: "#b3261e",
  treaty: "#1e6b4f",
  political: "#3d5a99",
  uprising: "#c77c1e",
  migration: "#7a4fa3",
  diplomatic: "#2a8fa3",
  economic: "#8a7a1e",
  terrorism: "#5a1e1e",
};

const CATEGORY_COLOR_EXPRESSION = [
  "match",
  ["get", "category"],
  ...Object.entries(CATEGORY_COLORS).flatMap(([k, v]) => [k, v]),
  "#666666",
];

// Territory names in boundaries.json sometimes carry a parenthetical
// qualifier, e.g. "Turkey (Ottoman Empire)" or "Iran (Persia)". A few of
// these shapes span the entire dataset under one unchanging name even though
// the real-world entity was renamed partway through (the Ottoman Empire
// became Turkey in 1923; Persia became Iran in 1935) - so which half of the
// name is period-appropriate depends on the selected year, not just on the
// feature. Everything else can just drop the parenthetical.
const HISTORICAL_NAME_OVERRIDES = {
  "Turkey (Ottoman Empire)": { until: 1923, name: "Ottoman Empire" },
  "Iran (Persia)": { until: 1935, name: "Persia" },
};

function displayName(name, year) {
  const override = HISTORICAL_NAME_OVERRIDES[name];
  if (override && year < override.until) return override.name;
  const openParen = name.indexOf(" (");
  return openParen >= 0 ? name.slice(0, openParen) : name;
}

// The demo basemap's own political layers show today's borders regardless of the
// timeline position - hide them so our own year-driven boundary layer is the only
// source of political geography on the map.
const MODERN_BORDER_LAYERS = [
  "countries-fill",
  "countries-boundary",
  "countries-label",
  "coastline",
  "crimea-fill",
];

function toGeoJSON(events) {
  return {
    type: "FeatureCollection",
    features: events
      .filter((e) => e.coordinates)
      .map((e) => ({
        type: "Feature",
        properties: { id: e.id, category: e.category, title: e.title },
        geometry: { type: "Point", coordinates: [e.coordinates.lon, e.coordinates.lat] },
      })),
  };
}

function boundariesForYear(year) {
  return {
    type: "FeatureCollection",
    features: boundariesData.features.filter(
      (f) => f.properties.start_year <= year && year <= f.properties.end_year
    ),
  };
}

// Signed area (shoelace) and area-weighted centroid of a single linear ring
// (an array of [lon, lat] positions). Coordinates are treated as flat/planar,
// which is an adequate approximation at the scale of a single territory.
function ringAreaAndCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate ring (collinear points) - fall back to a plain average.
    const avg = ring.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
    return { area: 0, centroid: [avg[0] / ring.length, avg[1] / ring.length] };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { area: Math.abs(area), centroid: [cx, cy] };
}

// A polygon can be made up of several disconnected parts (exclaves, islands,
// far-flung imperial holdings). Placing one label per part, as MapLibre's
// default "point" symbol placement does for MultiPolygons, produces many
// repeated labels for the same territory. Instead, pick a single anchor
// point: the centroid of the largest part by area.
function labelAnchor(geometry) {
  const polygons =
    geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  for (const polygon of polygons) {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) continue;
    const { area, centroid } = ringAreaAndCentroid(outerRing);
    if (!best || area > best.area) best = { area, centroid };
  }
  return best?.centroid ?? null;
}

// A separate point source (one feature per territory, at a single anchor
// point) so the boundaries-label layer never renders duplicate labels for
// multi-part territories - see labelAnchor() above.
function boundaryLabelsForYear(year) {
  return {
    type: "FeatureCollection",
    features: boundariesData.features
      .filter((f) => f.properties.start_year <= year && year <= f.properties.end_year)
      .map((f) => {
        const anchor = labelAnchor(f.geometry);
        if (!anchor) return null;
        return {
          type: "Feature",
          properties: { name: displayName(f.properties.name, year) },
          geometry: { type: "Point", coordinates: anchor },
        };
      })
      .filter(Boolean),
  };
}

export default function MapView({ events, year, onSelectEvent, selectedEventId }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const eventsRef = useRef(events);
  const yearRef = useRef(year);
  const [mapReady, setMapReady] = useState(false);

  eventsRef.current = events;
  yearRef.current = year;

  useEffect(() => {
    const map = new MaplibreMap({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [40, 29],
      zoom: 3.2,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__map = map; // debug helper, dev-only

    map.on("load", () => {
      for (const layerId of MODERN_BORDER_LAYERS) {
        map.setLayoutProperty(layerId, "visibility", "none");
      }

      // Physical land/water silhouette for world context (Mediterranean, Black Sea, Red
      // Sea, Persian Gulf, Europe, Africa, etc). Sourced from Natural Earth 1:50m land
      // polygons - pure physical geography with no political information at all, so it
      // can't reintroduce modern-border anachronisms the way the demo style's
      // "coastline" layer did. Kept subtle and placed below our own boundaries/events
      // layers so it reads as background context, not the focal layer.
      map.addSource("land", {
        type: "geojson",
        data: landData,
      });

      map.addLayer(
        {
          id: "land-fill",
          type: "fill",
          source: "land",
          paint: { "fill-color": "#e4ded0", "fill-opacity": 0.65 },
        },
        "coastline"
      );

      map.addSource("boundaries", {
        type: "geojson",
        data: boundariesForYear(yearRef.current),
      });

      map.addLayer(
        {
          id: "boundaries-fill",
          type: "fill",
          source: "boundaries",
          paint: { "fill-color": "#c77c1e", "fill-opacity": 0.06 },
        },
        "coastline"
      );

      map.addLayer({
        id: "boundaries-line",
        type: "line",
        source: "boundaries",
        paint: {
          "line-color": ["case", ["!=", ["get", "disputed"], null], "#c77c1e", "#8a8f96"],
          "line-width": 1.2,
          "line-dasharray": ["case", ["!=", ["get", "disputed"], null], ["literal", [2, 2]], ["literal", [1, 0]]],
        },
      });

      map.addSource("boundary-labels", {
        type: "geojson",
        data: boundaryLabelsForYear(yearRef.current),
      });

      map.addLayer({
        id: "boundaries-label",
        type: "symbol",
        source: "boundary-labels",
        layout: {
          // boundary-labels' "name" property is already resolved to the
          // period-appropriate display name - see displayName() above.
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Semibold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 5, 13, 8, 16],
          "text-max-width": 8,
          "text-padding": 4,
          "symbol-placement": "point",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#f4f1ea",
          "text-halo-color": "rgba(15,17,20,0.85)",
          "text-halo-width": 1.3,
          "text-halo-blur": 0.3,
        },
      });

      map.addSource("events", {
        type: "geojson",
        data: toGeoJSON(eventsRef.current),
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 12,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "events",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#6a7076",
          "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 24],
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "events",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#fff" },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "events",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": CATEGORY_COLOR_EXPRESSION,
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
        },
      });

      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));

      map.on("click", "clusters", (e) => {
        map.easeTo({ center: e.features[0].geometry.coordinates, zoom: map.getZoom() + 2 });
      });

      map.on("click", "unclustered-point", (e) => {
        onSelectEvent(e.features[0].properties.id);
      });

      setMapReady(true);
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current.getSource("events")?.setData(toGeoJSON(events));
  }, [events, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current.getSource("boundaries")?.setData(boundariesForYear(year));
    mapRef.current.getSource("boundary-labels")?.setData(boundaryLabelsForYear(year));
  }, [year, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current.setPaintProperty("unclustered-point", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedEventId ?? ""],
      10,
      6,
    ]);
  }, [selectedEventId, mapReady]);

  return <div ref={containerRef} className="map-view" />;
}
