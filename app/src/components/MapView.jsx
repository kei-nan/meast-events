import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { decadeFloor, loadBoundaryDecade, loadLand, prefetchBoundaryDecade } from "../lib/dataClient";
import { MIN_YEAR, MAX_YEAR } from "./Timeline";

// A curated "historical atlas" ink palette - muted, warm-leaning hues evocative of
// hand-tinted cartography (brick, verdigris, indigo, ochre) rather than generic
// bright web-primary colors. Each hue stays distinguishable at small marker sizes.
const CATEGORY_COLORS = {
  war: "#a13f2e",        // brick red
  treaty: "#4c7a63",     // verdigris green
  political: "#455d80",  // muted indigo
  uprising: "#c99a45",   // antique gold
  migration: "#7d5a7d",  // dusty plum
  diplomatic: "#3f7d84", // muted teal
  economic: "#8c7a3f",   // olive mustard
  terrorism: "#6b3140",  // deep oxblood
};

const CATEGORY_COLOR_EXPRESSION = [
  "match",
  ["get", "category"],
  ...Object.entries(CATEGORY_COLORS).flatMap(([k, v]) => [k, v]),
  "#6b6151",
];

// Period-correct naming (Ottoman Empire -> Turkey, mandate-era names, etc.) is now
// resolved at ingest time - see scripts/boundary-corrections.js - so boundaries.json's
// `name` property is already the right one to show for whatever year a feature is
// active. This component doesn't need its own historical knowledge.

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

// `features` is whatever decade chunk covers `year` (see the boundary-loading
// effects in MapView below) - a decade chunk can contain features that are only
// active for *part* of that decade (a short-lived phase, a flag window), so this
// still needs to filter down to the exact year, same as when the app had the
// whole boundaries.json in memory.
function boundariesForYear(year, features) {
  return {
    type: "FeatureCollection",
    features: features.filter(
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
function boundaryLabelsForYear(year, features) {
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => f.properties.start_year <= year && year <= f.properties.end_year)
      .map((f) => {
        const anchor = labelAnchor(f.geometry);
        if (!anchor) return null;
        // f.properties.name is already the period-appropriate display name - see
        // scripts/boundary-corrections.js.
        return {
          type: "Feature",
          properties: { name: f.properties.name },
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

  // Boundary decade chunks are fetched on demand and cached forever here -
  // scrubbing the timeline back over an already-visited decade never re-fetches
  // it. `boundaryVersion` just forces a re-render when the (mutable) cache gets
  // a new entry, since map.getSource().setData() below is an imperative escape
  // hatch React doesn't know to react to on its own.
  const boundaryCacheRef = useRef(new Map()); // decade -> features[]
  const [boundaryVersion, setBoundaryVersion] = useState(0);
  // Only the settled year triggers a new fetch; boundariesForYear/labels below
  // still run against the live `year` for instant filtering of whatever decade
  // is already cached, so scrubbing within a loaded decade has zero lag.
  const debouncedYear = useDebouncedValue(year, 150);

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

    map.on("load", async () => {
      for (const layerId of MODERN_BORDER_LAYERS) {
        map.setLayoutProperty(layerId, "visibility", "none");
      }

      // Land silhouette and the boundary decade covering the initial year are
      // both needed for a correct first paint, so fetch them in parallel and
      // wait on both before building the map's own sources/layers - this
      // avoids a flash of an empty map that then pops in borders a moment later.
      const initialDecade = decadeFloor(yearRef.current);
      const [initialLand, initialBoundaries] = await Promise.all([
        loadLand(),
        loadBoundaryDecade(initialDecade),
      ]);
      boundaryCacheRef.current.set(initialDecade, initialBoundaries.features);

      // Physical land/water silhouette for world context (Mediterranean, Black Sea, Red
      // Sea, Persian Gulf, Europe, Africa, etc). Sourced from Natural Earth 1:50m land
      // polygons - pure physical geography with no political information at all, so it
      // can't reintroduce modern-border anachronisms the way the demo style's
      // "coastline" layer did. Kept subtle and placed below our own boundaries/events
      // layers so it reads as background context, not the focal layer.
      map.addSource("land", {
        type: "geojson",
        data: initialLand,
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
        data: boundariesForYear(yearRef.current, initialBoundaries.features),
      });

      map.addLayer(
        {
          id: "boundaries-fill",
          type: "fill",
          source: "boundaries",
          paint: { "fill-color": "#8a6f45", "fill-opacity": 0.08 },
        },
        "coastline"
      );

      map.addLayer({
        id: "boundaries-line",
        type: "line",
        source: "boundaries",
        paint: {
          "line-color": ["case", ["!=", ["get", "status"], null], "#c99a45", "#8a7a5f"],
          "line-width": 1.2,
          "line-dasharray": ["case", ["!=", ["get", "status"], null], ["literal", [2, 2]], ["literal", [1, 0]]],
        },
      });

      map.addSource("boundary-labels", {
        type: "geojson",
        data: boundaryLabelsForYear(yearRef.current, initialBoundaries.features),
      });

      map.addLayer({
        id: "boundaries-label",
        type: "symbol",
        source: "boundary-labels",
        layout: {
          // boundary-labels' "name" property is already the period-appropriate
          // display name, resolved at ingest time.
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
          "circle-color": "#5c4d38",
          "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 24],
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(236,226,201,0.85)",
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
        paint: { "text-color": "#ece2c9" },
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
          "circle-stroke-color": "rgba(236,226,201,0.85)",
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

  // Fetch trigger: only fires when the *settled* year lands in a decade that
  // isn't cached yet. Also opportunistically warms the neighboring decades, so
  // crossing a decade boundary while scrubbing usually finds data already there.
  useEffect(() => {
    const decade = decadeFloor(debouncedYear);
    if (!boundaryCacheRef.current.has(decade)) {
      loadBoundaryDecade(decade).then((fc) => {
        boundaryCacheRef.current.set(decade, fc.features);
        setBoundaryVersion((v) => v + 1);
      });
    }
    const prevDecade = decade - 10;
    const nextDecade = decade + 10;
    if (prevDecade >= decadeFloor(MIN_YEAR) && !boundaryCacheRef.current.has(prevDecade)) {
      prefetchBoundaryDecade(prevDecade);
    }
    if (nextDecade <= decadeFloor(MAX_YEAR) && !boundaryCacheRef.current.has(nextDecade)) {
      prefetchBoundaryDecade(nextDecade);
    }
  }, [debouncedYear]);

  // Apply trigger: runs against the live (non-debounced) `year` so that once a
  // decade is cached, filtering/rendering it is instant with no debounce lag.
  // Until the target decade arrives, the map simply keeps showing whatever was
  // rendered last rather than clearing to empty.
  useEffect(() => {
    if (!mapReady) return;
    const decade = decadeFloor(year);
    const features = boundaryCacheRef.current.get(decade);
    if (!features) return;
    mapRef.current.getSource("boundaries")?.setData(boundariesForYear(year, features));
    mapRef.current.getSource("boundary-labels")?.setData(boundaryLabelsForYear(year, features));
  }, [year, boundaryVersion, mapReady]);

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
