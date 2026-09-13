import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import boundariesData from "../data/boundaries.json";

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

      map.addSource("boundaries", {
        type: "geojson",
        data: boundariesForYear(yearRef.current),
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
          "line-color": ["case", ["!=", ["get", "disputed"], null], "#c99a45", "#8a7a5f"],
          "line-width": 1.2,
          "line-dasharray": ["case", ["!=", ["get", "disputed"], null], ["literal", [2, 2]], ["literal", [1, 0]]],
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

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current.getSource("boundaries")?.setData(boundariesForYear(year));
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
